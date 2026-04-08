import type { DbCtx } from "./context";
import { ids } from "./ids";

/** Returns `_id` for an `edge_labels` row, inserting with empty `description` if missing. */
export function ensureEdgeLabel(ctx: DbCtx, value: string): string {
  const { db, now } = ctx;
  const existing = db
    .query<{ _id: string }, [string]>(`SELECT _id FROM edge_labels WHERE value = ?`)
    .get(value);
  if (existing) return existing._id;
  const id = ids.edgeLabel(value);
  db.run(`INSERT INTO edge_labels (_id, _ts_created, value, description) VALUES (?, ?, ?, ?)`, [
    id,
    now,
    value,
    "",
  ]);
  return id;
}
