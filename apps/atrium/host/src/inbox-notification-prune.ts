import type { AgentNotification, AgentNotificationRow } from "@khoralabs/agent-relay";
import type { AtriumHostContext } from "./create-atrium-host.ts";

/** Drop `inbox_post` notifications when the referenced post row is gone (lazy reconcile). */
export function pruneOrphanInboxPostNotifications(
  db: AtriumHostContext["db"],
  did: string,
  rows: AgentNotificationRow[],
  getPostById: (id: string) => { id: string } | undefined,
): AgentNotificationRow[] {
  const del = db.prepare(`DELETE FROM agent_notifications WHERE did = ? AND id = ?`);
  const out: AgentNotificationRow[] = [];
  for (const r of rows) {
    if (r.note.kind === "inbox_post") {
      const postId = (r.note as Extract<AgentNotification, { kind: "inbox_post" }>).payload.postId;
      if (getPostById(postId) === undefined) {
        del.run(did, r.id);
        continue;
      }
    }
    out.push(r);
  }
  return out;
}
