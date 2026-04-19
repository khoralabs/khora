import { ids } from "@cfd/memories-core";
import type { DbCtx } from "./context";
import { validatePropsAgainstJsonSchema } from "./validate-props";

function serializeProps(props: Record<string, unknown>): string {
  return JSON.stringify(props ?? {});
}

export function insertEdgeLabelAssignment(
  ctx: DbCtx,
  input: { edgeId: string; labelId: string; props: Record<string, unknown> },
): void {
  const { db, now } = ctx;
  const schemaRow = db
    .query<{ schema: string | null }, [string]>(`SELECT schema FROM edge_labels WHERE _id = ?`)
    .get(input.labelId);
  validatePropsAgainstJsonSchema(schemaRow?.schema ?? null, input.props);

  const assignmentId = ids.edgeLabelAssignment(input.edgeId, input.labelId);
  const propsJson = serializeProps(input.props);
  db.run(
    `INSERT OR REPLACE INTO edge_label_assignments (_id, _ts_created, edge_id, label_id, props) VALUES (?, ?, ?, ?, ?)`,
    [assignmentId, now, input.edgeId, input.labelId, propsJson],
  );
}
