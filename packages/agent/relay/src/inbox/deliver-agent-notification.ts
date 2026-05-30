import type { AgentNotification, AgentNotificationBufferPort } from "../registration/notifications";
import type { PrincipalId } from "../registration/types";
import type { InboxFanoutPort } from "./inbox-fanout-port";

/** Persist notification, push to connected inbox WebSockets; mark read when a session is connected. */
export async function deliverAgentNotification(
  buffer: AgentNotificationBufferPort,
  inbox: InboxFanoutPort,
  principalId: PrincipalId,
  note: AgentNotification,
): Promise<void> {
  const id = await buffer.enqueue(principalId, note);
  inbox.broadcast(principalId, { type: "notification", id, notification: note });
  if (inbox.listenerCount(principalId) > 0) {
    await buffer.markRead?.(principalId, [id]);
  }
}
