import {
  normalizeUsername,
  zAtriumRoomCreateBody,
  zAtriumRoomListResponse,
  zAtriumRoomMintTicketBody,
  zAtriumRoomTicketResponse,
} from "@khoralabs/atrium-contracts";
import { stableId } from "@khoralabs/memories-core";
import type { Server } from "bun";
import z from "zod";
import type { AtriumWsData } from "../ws/inbox.ts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

function webSocketBaseFromRequest(req: Request): string {
  const u = new URL(req.url);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}`;
}

const roomWsPathRe = /^\/v1\/atrium\/rooms\/([^/]+)\/ws$/;
const roomTicketPathRe = /^\/v1\/atrium\/rooms\/([^/]+)\/ticket$/;

type AtriumRoomRow = {
  room_id: string;
  created_by_profile_id: string;
  created_at_ms: number;
  invite_target_did: string | null;
  expires_at_ms: number | null;
};

/**
 * `POST /v1/atrium/rooms` — authenticated. Server mints `roomId`. Optionally enqueues inbox
 * **`negotiation_ticket`** for the invitee (`notification.kind === "negotiation_ticket"`, `payload`:
 * `{ roomId, ticket, expiresAtMs?, issuedAtMs?, fromDid? }`).
 */
export async function handleAtriumRoomsCreate(
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

  const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
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
    const row = ctx.usernamesRepo.lookupByUsername(normalized);
    if (row === undefined) return jsonError("Username not found", 404);
    targetDidResolved = row.did;
  } else if (body.targetDid !== undefined) {
    targetDidResolved = body.targetDid.trim();
  }

  if (targetDidResolved !== undefined && targetDidResolved === did) {
    return jsonError("Cannot invite yourself to a room", 400);
  }

  const ttlMs = body.ttlMs ?? 86_400_000;
  const now = Date.now();
  const expiresAtMs = now + ttlMs;
  const roomId = stableId("atrium_room", profileId, `${now}`, crypto.randomUUID());

  const { ticket } = await ctx.negotiationRoomHub.createRoom(roomId, ttlMs);

  try {
    ctx.db.run(
      `INSERT INTO atrium_rooms (room_id, created_by_profile_id, created_at_ms, invite_target_did, expires_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
      [roomId, profileId, now, targetDidResolved ?? null, expiresAtMs],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return jsonError("roomId collision; retry", 409);
    }
    return jsonError(msg, 500);
  }

  if (targetDidResolved !== undefined) {
    await ctx.host.offerNegotiationRoomToDid({
      targetDid: targetDidResolved,
      roomId,
      ticket,
      expiresAtMs,
      fromDid: did,
    });
  }

  const base = webSocketBaseFromRequest(req);
  const webSocketUrl = `${base}/v1/atrium/rooms/${encodeURIComponent(roomId)}/ws?ticket=${encodeURIComponent(ticket)}`;
  const payload = zAtriumRoomTicketResponse.parse({
    roomId,
    ticket,
    webSocketUrl,
    expiresAtMs,
  });
  return Response.json(payload);
}

/** `GET /v1/atrium/rooms` — rooms the caller created or was invited to. */
export async function handleAtriumRoomsList(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const rl = rateLimiters.roomsListDid(`did:${did}`);
  if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);

  const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
  if (profileId === undefined) {
    return jsonError("Register before listing rooms", 400);
  }

  const rows = ctx.db
    .query<AtriumRoomRow, [string, string]>(
      `SELECT room_id, created_by_profile_id, created_at_ms, invite_target_did, expires_at_ms
       FROM atrium_rooms
       WHERE created_by_profile_id = ? OR invite_target_did = ?
       ORDER BY created_at_ms DESC
       LIMIT 200`,
    )
    .all(profileId, did);

  const rooms = rows.map((row) => {
    const isCreator = row.created_by_profile_id === profileId;
    const role = isCreator ? ("creator" as const) : ("peer" as const);
    let counterpartDid: string | null;
    if (isCreator) {
      counterpartDid = row.invite_target_did;
    } else {
      counterpartDid =
        ctx.host.persistenceClient.didForAgentProfileId(row.created_by_profile_id) ?? null;
    }
    const counterpartUsername =
      counterpartDid !== null ? ctx.usernamesRepo.lookupByDid(counterpartDid)?.username : undefined;
    return {
      roomId: row.room_id,
      role,
      createdAtMs: row.created_at_ms,
      expiresAtMs: row.expires_at_ms,
      counterpartDid,
      ...(counterpartUsername !== undefined ? { counterpartUsername } : {}),
      ...(isCreator ? { inviteTargetDid: row.invite_target_did } : {}),
    };
  });

  const payload = zAtriumRoomListResponse.parse({ rooms });
  return Response.json(payload);
}

/**
 * `POST /v1/atrium/rooms/:roomId/ticket` — mint a fresh join ticket (rejoin) without clearing relay
 * frames. Caller must be room creator or `invite_target_did`.
 */
export async function handleAtriumRoomMintTicket(
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

  const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
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
  const row = ctx.db
    .query<AtriumRoomRow, [string]>(
      `SELECT room_id, created_by_profile_id, created_at_ms, invite_target_did, expires_at_ms
       FROM atrium_rooms WHERE room_id = ?`,
    )
    .get(roomId);
  if (row === null) {
    return jsonError("Room not found", 404);
  }

  const isCreator = row.created_by_profile_id === profileId;
  const isInvitee = row.invite_target_did !== null && row.invite_target_did === did;
  if (!isCreator && !isInvitee) {
    return jsonError("Forbidden", 403);
  }

  const relay = ctx.host.persistenceClient.persistence.negotiationRelay;
  if (relay.getPairingSecretIfActive(roomId, Date.now()) === undefined) {
    return jsonError("Room relay expired or inactive", 410);
  }

  const ttlMs = mintBody.ttlMs ?? 86_400_000;
  const now = Date.now();
  const expiresAtMs = now + ttlMs;
  let ticket: string;
  try {
    ({ ticket } = await ctx.negotiationRoomHub.rotateRoomTicket(roomId, ttlMs));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no active room")) {
      return jsonError("Room relay expired or inactive", 410);
    }
    return jsonError(msg, 500);
  }

  ctx.db.run(`UPDATE atrium_rooms SET expires_at_ms = ? WHERE room_id = ?`, [expiresAtMs, roomId]);

  const base = webSocketBaseFromRequest(req);
  const webSocketUrl = `${base}/v1/atrium/rooms/${encodeURIComponent(roomId)}/ws?ticket=${encodeURIComponent(ticket)}`;
  const payload = zAtriumRoomTicketResponse.parse({
    roomId,
    ticket,
    webSocketUrl,
    expiresAtMs,
  });
  return Response.json(payload);
}

export function parseAtriumRoomTicketPath(pathname: string): string | undefined {
  const m = roomTicketPathRe.exec(pathname);
  if (m == null || m[1] === undefined) return undefined;
  return m[1];
}

/**
 * `GET /v1/atrium/rooms/:roomId/ws?ticket=…` — WebSocket upgrade (ticket auth only; treat ticket as secret).
 */
export async function handleAtriumRoomWsUpgrade(
  req: Request,
  url: URL,
  srv: Server<AtriumWsData>,
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
  const ok = await deps.ctx.negotiationRoomHub.verifyTicket(roomId, ticket);
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

export function isAtriumRoomWsPath(pathname: string): boolean {
  return roomWsPathRe.test(pathname);
}
