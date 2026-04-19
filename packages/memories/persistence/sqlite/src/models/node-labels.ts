import { ids } from "@cfd/memories-core";
import type { DbCtx } from "./context";

/** Returns `_id` for a `node_labels` row (catalog kind), inserting when missing. */
export function ensureNodeLabel(
  ctx: DbCtx,
  input: { kind: string; description?: string; schemaJson?: string | null },
): string {
  const { db, now } = ctx;
  const description = input.description ?? "";
  const schemaJson =
    input.schemaJson === undefined || input.schemaJson === "" ? null : input.schemaJson;

  const existing = db
    .query<{ _id: string; schema: string | null }, [string]>(
      `SELECT _id, schema FROM node_labels WHERE kind = ?`,
    )
    .get(input.kind);

  if (existing) {
    if (schemaJson != null && schemaJson !== existing.schema) {
      db.run(`UPDATE node_labels SET description = ?, schema = ? WHERE _id = ?`, [
        description,
        schemaJson,
        existing._id,
      ]);
    }
    return existing._id;
  }

  const id = ids.nodeLabel(input.kind);
  db.run(
    `INSERT INTO node_labels (_id, _ts_created, kind, description, schema) VALUES (?, ?, ?, ?, ?)`,
    [id, now, input.kind, description, schemaJson],
  );
  return id;
}
