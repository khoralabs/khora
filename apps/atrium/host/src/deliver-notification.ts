import type { AgentDid, AgentNotification, AgentNotificationBufferPort } from "@cfd/swarm-host";
import type { InboxWsHub } from "./inbox-ws-hub.ts";

/** Persist notification, push to any WebSocket sessions for DID, mark read on first delivery. */
export async function enqueueAndPush(
  buffer: AgentNotificationBufferPort,
  hub: InboxWsHub,
  did: AgentDid,
  note: AgentNotification,
): Promise<void> {
  const id = await buffer.enqueue(did, note);
  hub.broadcast(did, { type: "notification", id, notification: note });
  /** Mark read only when at least one WebSocket session is connected (first delivery). */
  if (hub.listenerCount(did) > 0) {
    await buffer.markRead?.(did, [id]);
  }
}
