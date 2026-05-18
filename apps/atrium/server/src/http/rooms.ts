import { createHash } from "node:crypto";
import {
  normalizeUsername,
  zAtriumRelationshipItem,
  zAtriumRoomCreateBody,
  zAtriumRoomCreateResponse,
  zAtriumRoomJoinRequestBody,
  zAtriumRoomJoinTicketResponse,
  zAtriumRoomMintTicketBody,
  zAtriumRoomTicketResponse,
} from "@khoralabs/atrium-contracts";
import type {
  AtriumRoomLifecycleHostEvent,
  AtriumWsUpgradePort,
} from "@khoralabs/atrium-transport";
import z from "zod";
import { logger } from "../logger.ts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

function safeRoomLifecycle(ctx: HostRouteDeps["ctx"], event: AtriumRoomLifecycleHostEvent): void {
  try {
    ctx.roomLifecycle?.(event);
  } catch {
    /* observer errors must not affect HTTP */
  }
}

function webSocketBaseFromRequest(req: Request): string {
  const u = new URL(req.url);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}`;
}

function sha256Hex(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

function randomJoinToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function parseRoomInviteProjection(projection: unknown):
  | {
      roomId: string;
      creatorDid: string;
      inviteExpiresAtMs: number;
      consumedByDid: string | null;
      consumedAtMs: number | null;
    }
  | undefined {
  if (projection === null || typeof projection !== "object") return undefined;
  const o = projection as Record<string, unknown>;
  const roomId = o.roomId;
  const creatorDid = o.creatorDid;
  const inviteExpiresAtMs = o.inviteExpiresAtMs;
  if (
    typeof roomId !== "string" ||
    typeof creatorDid !== "string" ||
    typeof inviteExpiresAtMs !== "number"
  ) {
    return undefined;
  }
  const c = o.consumedByDid;
  const consumedByDid =
    c === null || c === undefined ? null : typeof c === "string" ? c : undefined;
  if (consumedByDid === undefined && c !== null && c !== undefined) return undefined;
  const at = o.consumedAtMs;
  const consumedAtMs =
    at === null || at === undefined ? null : typeof at === "number" ? at : undefined;
  if (consumedAtMs === undefined && at !== null && at !== undefined) return undefined;
  return {
    roomId,
    creatorDid,
    inviteExpiresAtMs,
    consumedByDid: consumedByDid ?? null,
    consumedAtMs: consumedAtMs ?? null,
  };
}

const roomWsPathRe = /^\/v1\/rooms\/([^/]+)\/ws$/;
const roomMintTicketPathRe = /^\/v1\/rooms\/([^/]+)\/ticket$/;
const roomUnaryPathRe = /^\/v1\/rooms\/([^/]+)$/;

function parseRoomRegistryProjection(
  projection: unknown,
): { creatorDid: string; inviteTargetDid: string | null; expiresAtMs: number } | undefined {
  if (projection === null || typeof projection !== "object") return undefined;
  const o = projection as Record<string, unknown>;
  const creatorDid = o.creatorDid;
  const expiresAtMs = o.expiresAtMs;
  if (typeof creatorDid !== "string" || typeof expiresAtMs !== "number") return undefined;
  const inv = o.inviteTargetDid;
  const inviteTargetDid =
    inv === null || inv === undefined ? null : typeof inv === "string" ? inv : undefined;
  if (inviteTargetDid === undefined && inv !== null && inv !== undefined) return undefined;
  return { creatorDid, inviteTargetDid: inviteTargetDid ?? null, expiresAtMs };
}

function relationshipRowToApiItem(
  viewerDid: string,
  row: {
    channelId: string;
    creatorPrincipalId: string;
    peerPrincipalId: string | null;
    createdAtMs: number;
    expiresAtMs?: number;
  },
) {
  const role = row.creatorPrincipalId === viewerDid ? "creator" : "peer";
  return zAtriumRelationshipItem.parse({
    roomId: row.channelId,
    role,
    creatorDid: row.creatorPrincipalId,
    peerDid: row.peerPrincipalId,
    createdAtMs: row.createdAtMs,
    ...(row.expiresAtMs !== undefined ? { expiresAtMs: row.expiresAtMs } : {}),
  });
}

export async function handleRoomsCreate(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const bodyText = await req.text();
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const rl = rateLimiters.roomsCreateDid(`did:${did}`);
  if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Register before creating rooms", 400);
  }
  let body: z.infer<typeof zAtriumRoomCreateBody>;
  try {
    body = zAtriumRoomCreateBody.parse(JSON.parse(bodyText) as unknown);
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.message : "Invalid JSON body";
    return jsonError(msg, 400);
  }
  if (body.targetDid !== undefined && body.targetUsername !== undefined) {
    return jsonError("Specify only one of targetDid or targetUsername", 400);
  }
  let targetDidResolved: string | undefined;
  if (body.targetUsername !== undefined) {
    let normalized: string;
    try {
      normalized = normalizeUsername(body.targetUsername);
    } catch {
      return jsonError("Username not found", 404);
    }
    const pid = ctx.lookupPrincipalIdByNormalizedUsername(normalized);
    if (pid === undefined) {
      return jsonError("Username not found", 404);
    }
    targetDidResolved = pid;
  } else if (body.targetDid !== undefined) {
    targetDidResolved = body.targetDid.trim();
  }
  if (targetDidResolved !== undefined && targetDidResolved === did) {
    return jsonError("Cannot invite yourself to a room", 400);
  }
  const ttlMs = body.ttlMs ?? 86_400_000;
  const now = Date.now();
  const expiresAtMs = now + ttlMs;
  const roomId = crypto.randomUUID();
  const { ticket } = await ctx.roomHub.createChannel(roomId, ttlMs);
  const base = webSocketBaseFromRequest(req);
  const webSocketUrl = `${base}/v1/rooms/${encodeURIComponent(roomId)}/ws?ticket=${encodeURIComponent(ticket)}`;
  const ticketPayload = {
    roomId,
    ticket,
    webSocketUrl,
    expiresAtMs,
  };
  ctx.upsertRoomRegistryRow(roomId, {
    creatorDid: did,
    inviteTargetDid: targetDidResolved ?? null,
    expiresAtMs,
  });
  try {
    ctx.social.createRelationship({
      channelId: roomId,
      creatorPrincipalId: did,
      expiresAtMs,
    });
    if (targetDidResolved !== undefined) {
      ctx.social.bindPeer({
        channelId: roomId,
        peerPrincipalId: targetDidResolved,
      });
    }
  } catch {
    return jsonError("Room setup failed", 500);
  }
  safeRoomLifecycle(ctx, {
    kind: "room_created",
    roomId,
    creatorDid: did,
    inviteTargetDid: targetDidResolved ?? null,
    hasOpenInvite: targetDidResolved === undefined,
    expiresAtMs,
  });
  logger.info(
    { roomId, creatorDid: did, inviteTargetDid: targetDidResolved ?? null },
    "room_created",
  );
  if (targetDidResolved !== undefined) {
    const entryKey = `${targetDidResolved}/${roomId}`;
    ctx.upsertRelayInboxRoomTicketRow(entryKey, roomId, {
      kind: "room_ticket",
      channelId: roomId,
      ticket,
      webSocketUrl,
      expiresAtMs,
      issuedAtMs: now,
      fromPrincipalId: did,
    });
    const hub = ctx.host.inboxHub;
    if (hub !== undefined && hub.listenerCount(targetDidResolved) > 0) {
      hub.broadcast(targetDidResolved, {
        type: "notification",
        id: now,
        notification: {
          kind: "room_ticket",
          payload: {
            channelId: roomId,
            ticket,
            expiresAtMs,
            issuedAtMs: now,
            fromPrincipalId: did,
          },
        },
      });
    }
  }
  if (targetDidResolved === undefined) {
    const joinToken = randomJoinToken();
    const hashKey = sha256Hex(joinToken);
    ctx.upsertRoomInviteRow(hashKey, {
      roomId,
      creatorDid: did,
      inviteExpiresAtMs: expiresAtMs,
      consumedByDid: null,
      consumedAtMs: null,
    });
    return Response.json(zAtriumRoomCreateResponse.parse({ ...ticketPayload, joinToken }));
  }
  return Response.json(zAtriumRoomCreateResponse.parse(ticketPayload));
}

/**
 * `POST /v1/rooms/join` — redeem a link invite; binds invitee DID, returns a fresh WebSocket ticket.
 */
export async function handleRoomsJoin(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const bodyText = await req.text();
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const rl = rateLimiters.roomsJoinDid(`did:${did}`);
  if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Register before joining a room", 400);
  }
  let joinBody: z.infer<typeof zAtriumRoomJoinRequestBody>;
  try {
    joinBody = zAtriumRoomJoinRequestBody.parse(JSON.parse(bodyText) as unknown);
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.message : "Invalid JSON body";
    return jsonError(msg, 400);
  }
  const hashKey = sha256Hex(joinBody.joinToken);
  const invHit = ctx.lookupRoomInviteRow(hashKey);
  if (!invHit.found || invHit.projection === null) {
    return jsonError("Invite not found", 404);
  }
  const inv = parseRoomInviteProjection(invHit.projection);
  if (inv === undefined) {
    return jsonError("Invite not found", 404);
  }
  if (inv.consumedByDid !== null) {
    return jsonError("Invite already used", 409);
  }
  if (Date.now() > inv.inviteExpiresAtMs) {
    return jsonError("Invite expired", 410);
  }
  if (inv.creatorDid === did) {
    return jsonError("Cannot redeem your own room invite", 400);
  }
  const roomHit = ctx.lookupRoomRegistryRow(inv.roomId);
  if (!roomHit.found || roomHit.projection === null) {
    return jsonError("Room not found", 404);
  }
  const meta = parseRoomRegistryProjection(roomHit.projection);
  if (meta === undefined) {
    return jsonError("Room not found", 404);
  }
  if (meta.creatorDid !== inv.creatorDid) {
    return jsonError("Invite not found", 404);
  }
  if (meta.inviteTargetDid !== null && meta.inviteTargetDid !== did) {
    return jsonError("Room invite slot already filled", 409);
  }
  const hubPersistence = ctx.host.persistenceClient.persistence.frameChannelHubPersistence;
  if (hubPersistence.getPairingSecretIfActive(inv.roomId, Date.now()) === undefined) {
    return jsonError("Room inactive or ticket secret expired", 410);
  }
  const ttlMs = 86_400_000;
  const now = Date.now();
  ctx.upsertRoomRegistryRow(inv.roomId, {
    creatorDid: meta.creatorDid,
    inviteTargetDid: did,
    expiresAtMs: meta.expiresAtMs,
  });
  try {
    ctx.social.bindPeer({ channelId: inv.roomId, peerPrincipalId: did });
  } catch {
    return jsonError("Room setup failed", 500);
  }
  ctx.upsertRoomInviteRow(hashKey, {
    roomId: inv.roomId,
    creatorDid: inv.creatorDid,
    inviteExpiresAtMs: inv.inviteExpiresAtMs,
    consumedByDid: did,
    consumedAtMs: now,
  });
  let ticket: string;
  try {
    ({ ticket } = await ctx.roomHub.rotateChannelTicket(inv.roomId, ttlMs));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no active room")) {
      return jsonError("Room inactive or ticket secret expired", 410);
    }
    return jsonError(msg, 500);
  }
  const expiresAtMs = now + ttlMs;
  const base = webSocketBaseFromRequest(req);
  const webSocketUrl = `${base}/v1/rooms/${encodeURIComponent(inv.roomId)}/ws?ticket=${encodeURIComponent(ticket)}`;
  ctx.upsertRoomRegistryRow(inv.roomId, {
    creatorDid: meta.creatorDid,
    inviteTargetDid: did,
    expiresAtMs,
  });
  ctx.social.refreshRelationshipTicketExpiry({
    channelId: inv.roomId,
    expiresAtMs,
  });
  const payload = zAtriumRoomJoinTicketResponse.parse({
    roomId: inv.roomId,
    creatorDid: meta.creatorDid,
    ticket,
    webSocketUrl,
    expiresAtMs,
  });
  safeRoomLifecycle(ctx, {
    kind: "room_invite_redeemed",
    roomId: inv.roomId,
    creatorDid: meta.creatorDid,
    peerDid: did,
    expiresAtMs,
  });
  logger.info(
    { roomId: inv.roomId, creatorDid: meta.creatorDid, peerDid: did },
    "room_invite_redeemed",
  );
  return Response.json(payload);
}

/**
 * `POST /v1/rooms/:roomId/ticket` — mint a fresh join ticket (rejoin); caller must be creator or invitee.
 */
export async function handleRoomsMintTicket(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  roomIdRaw: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const bodyText = await req.text();
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const rl = rateLimiters.roomsTicketMintDid(`did:${did}`);
  if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Register before minting room tickets", 400);
  }
  let mintBody: z.infer<typeof zAtriumRoomMintTicketBody> = {};
  if (bodyText.trim().length > 0) {
    try {
      mintBody = zAtriumRoomMintTicketBody.parse(JSON.parse(bodyText) as unknown);
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.message : "Invalid JSON body";
      return jsonError(msg, 400);
    }
  }
  const roomId = decodeURIComponent(roomIdRaw);
  const hit = ctx.lookupRoomRegistryRow(roomId);
  if (!hit.found || hit.projection === null) {
    return jsonError("Room not found", 404);
  }
  const meta = parseRoomRegistryProjection(hit.projection);
  if (meta === undefined) {
    return jsonError("Room not found", 404);
  }
  const isCreator = meta.creatorDid === did;
  const isInvitee = meta.inviteTargetDid !== null && meta.inviteTargetDid === did;
  if (!isCreator && !isInvitee) {
    const msg =
      meta.inviteTargetDid === null
        ? "Redeem a room invite with POST /v1/rooms/join first"
        : "Forbidden";
    return jsonError(msg, 403);
  }
  const hubPersistence = ctx.host.persistenceClient.persistence.frameChannelHubPersistence;
  if (hubPersistence.getPairingSecretIfActive(roomId, Date.now()) === undefined) {
    return jsonError("Room inactive or ticket secret expired", 410);
  }
  const ttlMs = mintBody.ttlMs ?? 86_400_000;
  const now = Date.now();
  const expiresAtMs = now + ttlMs;
  let ticket: string;
  try {
    ({ ticket } = await ctx.roomHub.rotateChannelTicket(roomId, ttlMs));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no active room")) {
      return jsonError("Room inactive or ticket secret expired", 410);
    }
    return jsonError(msg, 500);
  }
  const base = webSocketBaseFromRequest(req);
  const webSocketUrl = `${base}/v1/rooms/${encodeURIComponent(roomId)}/ws?ticket=${encodeURIComponent(ticket)}`;
  ctx.upsertRoomRegistryRow(roomId, {
    creatorDid: meta.creatorDid,
    inviteTargetDid: meta.inviteTargetDid,
    expiresAtMs,
  });
  ctx.social.refreshRelationshipTicketExpiry({
    channelId: roomId,
    expiresAtMs,
  });
  const payload = zAtriumRoomTicketResponse.parse({
    roomId,
    ticket,
    webSocketUrl,
    expiresAtMs,
  });
  safeRoomLifecycle(ctx, {
    kind: "room_ticket_minted",
    roomId,
    principalDid: did,
    expiresAtMs,
  });
  logger.debug({ roomId, did }, "room_ticket_minted");
  return Response.json(payload);
}

export async function handleRoomsGet(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  roomIdRaw: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const rl = rateLimiters.roomsReadDid(`did:${did}`);
  if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Register before reading rooms", 400);
  }
  const roomId = decodeURIComponent(roomIdRaw);
  if (roomId === "join") {
    return jsonError("Not found", 404);
  }
  const row = ctx.social.getRelationship(roomId);
  if (row === undefined) {
    return jsonError("Room not found", 404);
  }
  const isCreator = row.creatorPrincipalId === did;
  const isPeer = row.peerPrincipalId !== null && row.peerPrincipalId === did;
  if (!isCreator && !isPeer) {
    return jsonError("Forbidden", 403);
  }
  return Response.json(relationshipRowToApiItem(did, row));
}

export async function handleRoomsRemove(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  roomIdRaw: string,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const rl = rateLimiters.roomsRemoveDid(`did:${did}`);
  if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);
  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Register before removing rooms", 400);
  }
  const roomId = decodeURIComponent(roomIdRaw);
  if (roomId === "join") {
    return jsonError("Not found", 404);
  }
  const row = ctx.social.getRelationship(roomId);
  if (row === undefined) {
    return jsonError("Room not found", 404);
  }
  const isCreator = row.creatorPrincipalId === did;
  const isPeer = row.peerPrincipalId !== null && row.peerPrincipalId === did;
  if (!isCreator && !isPeer) {
    return jsonError("Forbidden", 403);
  }

  const regHit = ctx.lookupRoomRegistryRow(roomId);
  let inviteTargetDid: string | null = null;
  if (regHit.found && regHit.projection !== null) {
    const meta = parseRoomRegistryProjection(regHit.projection);
    if (meta !== undefined) {
      inviteTargetDid = meta.inviteTargetDid;
    }
  }

  const removed = ctx.social.deleteRelationship(roomId);
  if (removed === undefined) {
    return jsonError("Room not found", 404);
  }

  ctx.deleteRoomRegistryRow(roomId);
  if (inviteTargetDid !== null && inviteTargetDid.length > 0) {
    ctx.deleteRelayInboxRoomTicketRow(`${inviteTargetDid}/${roomId}`);
  }

  logger.info({ roomId, did }, "room_left");
  return new Response(null, { status: 204 });
}

export function parseRoomsMintTicketRoomId(pathname: string): string | undefined {
  const m = roomMintTicketPathRe.exec(pathname);
  if (m == null || m[1] === undefined) return undefined;
  return m[1];
}

/** Segments `join` and paths with extra segments (e.g. `/ws`) must not use this matcher. */
export function parseRoomsUnaryRoomId(pathname: string): string | undefined {
  const m = roomUnaryPathRe.exec(pathname);
  if (m == null || m[1] === undefined) return undefined;
  return m[1];
}

export async function handleRoomWsUpgrade(
  req: Request,
  url: URL,
  srv: AtriumWsUpgradePort,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return jsonError("Expected WebSocket upgrade", 426);
  }
  const m = roomWsPathRe.exec(url.pathname);
  if (m == null || m[1] === undefined) {
    return jsonError("Invalid room WebSocket path", 400);
  }
  const roomId = decodeURIComponent(m[1]);
  const ticket = url.searchParams.get("ticket") ?? "";
  if (ticket.length === 0) {
    return jsonError("Missing ticket", 400);
  }
  const ok = await deps.ctx.roomHub.verifyTicket(roomId, ticket);
  if (!ok) {
    return jsonError("Invalid or expired ticket", 401);
  }
  const upgraded = srv.upgrade(req, {
    data: { kind: "room", sessionId: roomId },
  });
  if (!upgraded) {
    return jsonError("WebSocket upgrade failed", 500);
  }
  return undefined;
}

export function isRoomWsPath(pathname: string): boolean {
  return roomWsPathRe.test(pathname);
}
