import type { AgentRelayFrameChannelWsData } from "@khoralabs/agent-relay";
import type { WebSocketHandler } from "bun";
import type { AtriumHostContext } from "../create-atrium-host.ts";
import { pruneOrphanInboxPostNotifications } from "../inbox-notification-prune.ts";

/** Discriminated WebSocket `data` for Atrium host (inbox vs OBP room relay). */
export type AtriumWsData = { kind: "inbox"; did: string } | AgentRelayFrameChannelWsData;

export async function sendInboxSnapshot(
  ws: { send: (data: string) => unknown },
  did: string,
  ctx: AtriumHostContext,
  snapshotLimit: number,
): Promise<void> {
  const list = ctx.notificationBuffer.listRecent;
  const markRead = ctx.notificationBuffer.markRead;
  if (list === undefined) return;
  let rows = await list(did, snapshotLimit);
  rows = pruneOrphanInboxPostNotifications(ctx.db, did, rows, (id) =>
    ctx.host.persistenceClient.getPostById(id),
  );
  ws.send(
    JSON.stringify({
      type: "snapshot",
      notifications: rows.map((r) => ({
        id: r.id,
        createdAtMs: r.createdAtMs,
        read: r.readAtMs !== null,
        notification: r.note,
      })),
    }),
  );
  if (markRead !== undefined) {
    const unreadIds = rows.filter((r) => r.readAtMs === null).map((r) => r.id);
    if (unreadIds.length > 0) {
      await markRead(did, unreadIds);
    }
  }
}

export function createInboxWsHandlers(opts: {
  ctx: AtriumHostContext;
  snapshotLimit: () => number;
}): WebSocketHandler<{ kind: "inbox"; did: string }> {
  return {
    open(ws) {
      const did = ws.data.did;
      const { inboxHub } = opts.ctx.host;
      if (inboxHub === undefined) {
        throw new Error("Atrium: AgentRelay missing inboxHub");
      }
      inboxHub.add(did, ws);
      void sendInboxSnapshot(ws, did, opts.ctx, opts.snapshotLimit());
    },
    close(ws, _code, _reason) {
      const { inboxHub } = opts.ctx.host;
      if (inboxHub !== undefined) {
        inboxHub.remove(ws.data.did, ws);
      }
    },
    message(_ws, _message) {},
  };
}
