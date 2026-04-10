import { ids } from "@cfd/memories";
import type { DbCtx } from "./context";

export function insertNodeLabelAssignment(
  ctx: DbCtx,
  input: { nodeId: string; labelId: string },
): void {
  const { db, now } = ctx;
  const assignmentId = ids.nodeLabelAssignment(input.nodeId, input.labelId);
  db.run(
    `INSERT INTO node_label_assignments (_id, _ts_created, node_id, label_id) VALUES (?, ?, ?, ?)`,
    [assignmentId, now, input.nodeId, input.labelId],
  );
}
