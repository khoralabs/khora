import { ids } from "@cfd/memories";
import type { DbCtx } from "./context";

export function insertEdgeLabelAssignment(
  ctx: DbCtx,
  input: { edgeId: string; labelId: string },
): void {
  const { db, now } = ctx;
  const assignmentId = ids.edgeLabelAssignment(input.edgeId, input.labelId);
  db.run(
    `INSERT INTO edge_label_assignments (_id, _ts_created, edge_id, label_id) VALUES (?, ?, ?, ?)`,
    [assignmentId, now, input.edgeId, input.labelId],
  );
}
