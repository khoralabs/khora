import type { Server } from "bun";
import { envInboxSnapshotLimit } from "../env.ts";
import { pruneOrphanInboxPostNotifications } from "../inbox-notification-prune.ts";
import type { AtriumWsData } from "../ws/inbox.ts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

export async function handleInboxWsUpgrade(
  req: Request,
  url: URL,
  srv: Server<AtriumWsData>,
  deps: HostRouteDeps,
): Promise<Response | undefined> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireInboxAccess(req, url, []));
  } catch (e) {
    return authErrorResponse(e);
  }
  const inboxRl = rateLimiters.inboxDid(`did:${did}`);
  if (!inboxRl.ok) return rateLimitedResponse(inboxRl.retryAfterSec);
  const ok = srv.upgrade(req, { data: { kind: "inbox", did } });
  if (!ok) {
    return jsonError("WebSocket upgrade failed", 500);
  }
  return undefined;
}

export async function handleInboxList(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  let did: string;
  try {
    ({ did } = await ctx.auth.requireInboxAccess(req, url, ["limit", "markRead"]));
  } catch (e) {
    return authErrorResponse(e);
  }
  const inboxRl = rateLimiters.inboxDid(`did:${did}`);
  if (!inboxRl.ok) return rateLimitedResponse(inboxRl.retryAfterSec);
  const list = ctx.notificationBuffer.listRecent;
  if (list === undefined) {
    return jsonError("inbox list not available", 501);
  }
  const limit = Math.min(Number(url.searchParams.get("limit")) || envInboxSnapshotLimit(), 500);
  let rows = await list(did, limit);
  rows = pruneOrphanInboxPostNotifications(ctx.db, did, rows, (id) =>
    ctx.host.persistenceClient.getPostById(id),
  );
  const markRead =
    url.searchParams.get("markRead") === "1" || url.searchParams.get("markRead") === "true";
  if (markRead && ctx.notificationBuffer.markRead !== undefined) {
    const unreadIds = rows.filter((r) => r.readAtMs === null).map((r) => r.id);
    if (unreadIds.length > 0) {
      await ctx.notificationBuffer.markRead(did, unreadIds);
    }
  }
  return Response.json({
    notifications: rows.map((r) => ({
      id: r.id,
      createdAtMs: r.createdAtMs,
      read: r.readAtMs !== null,
      notification: r.note,
    })),
  });
}
