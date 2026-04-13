import { ids } from "@cfd/memories-core";
import type { DbCtx } from "./context";
import { validatePropsAgainstJsonSchema } from "./validate-props";

function serializeProps(props: Record<string, unknown>): string {
  return JSON.stringify(props ?? {});
}

export function insertNodeLabelAssignment(
  ctx: DbCtx,
  input: { nodeId: string; labelId: string; props: Record<string, unknown> },
): void {
  const { db, now } = ctx;
  const schemaRow = db
    .query<{ schema: string | null }, [string]>(`SELECT schema FROM node_labels WHERE _id = ?`)
    .get(input.labelId);
  validatePropsAgainstJsonSchema(schemaRow?.schema ?? null, input.props);

  const assignmentId = ids.nodeLabelAssignment(input.nodeId, input.labelId);
  const propsJson = serializeProps(input.props);
  db.run(
    `INSERT OR REPLACE INTO node_label_assignments (_id, _ts_created, node_id, label_id, props) VALUES (?, ?, ?, ?, ?)`,
    [assignmentId, now, input.nodeId, input.labelId, propsJson],
  );
}
