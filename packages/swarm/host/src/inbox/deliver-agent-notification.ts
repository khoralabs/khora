import type { AgentNotification, AgentNotificationBufferPort } from "../registration/notifications.ts";
import type { AgentDid } from "../registration/types.ts";
import type { InboxFanoutPort } from "./inbox-fanout-port.ts";

/** Persist notification, push to connected inbox WebSockets; mark read when a session is connected. */
export async function deliverAgentNotification(
  buffer: AgentNotificationBufferPort,
  inbox: InboxFanoutPort,
  did: AgentDid,
  note: AgentNotification,
): Promise<void> {
  const id = await buffer.enqueue(did, note);
  inbox.broadcast(did, { type: "notification", id, notification: note });
  if (inbox.listenerCount(did) > 0) {
    await buffer.markRead?.(did, [id]);
  }
}
