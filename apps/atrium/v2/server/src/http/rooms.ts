import { RELAY_INBOX_SOURCE_MAP_ID } from "@khoralabs/at2-host";
import type { At2WsUpgradePort } from "@khoralabs/at2-transport";
import { normalizeUsername, zAtriumRoomCreateBody, zAtriumRoomTicketResponse } from "@khoralabs/at2-contracts";
import { relaySyntheticPointer } from "@khoralabs/relay-colonnade";
import {
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "@khoralabs/relay-colonnade";
import z from "zod";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

function webSocketBaseFromRequest(req: Request): string {
  const u = new URL(req.url);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}`;
}

const roomWsPathRe = /^\/v1\/rooms\/([^/]+)\/ws$/;

export async function handleRoomsCreate(req: Request, url: URL, deps: HostRouteDeps): Promise<Response> {
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
    const hit = ctx.store.lookupProjection(
      USERNAME_INDEX_TENANT_KEY,
      SOURCE_USERNAME_TO_PRINCIPAL,
      normalized,
    );
    if (!hit.found || hit.projection === null || typeof hit.projection !== "object") {
      return jsonError("Username not found", 404);
    }
    const pid = (hit.projection as Record<string, unknown>).principalId;
    if (typeof pid !== "string") {
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
  const payload = zAtriumRoomTicketResponse.parse({
    roomId,
    ticket,
    webSocketUrl,
    expiresAtMs,
  });
  if (targetDidResolved !== undefined) {
    const entryKey = `${targetDidResolved}/${roomId}`;
    ctx.store.upsertRow({
      tenant_key: ctx.tenantKey,
      source_map_id: RELAY_INBOX_SOURCE_MAP_ID,
      entry_key: entryKey,
      pointer: relaySyntheticPointer(ctx.tenantKey, "relay:room-ticket", roomId),
      projection: {
        kind: "room_ticket",
        channelId: roomId,
        ticket,
        webSocketUrl,
        expiresAtMs,
        issuedAtMs: now,
        fromPrincipalId: did,
      },
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
  return Response.json(payload);
}

export async function handleRoomWsUpgrade(
  req: Request,
  url: URL,
  srv: At2WsUpgradePort,
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
