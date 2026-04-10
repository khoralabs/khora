import { ids } from "@cfd/memories";
import type { DbCtx } from "./context";

/** Returns `_id` for a `node_labels` row, inserting with empty `description` if missing. */
export function ensureNodeLabel(ctx: DbCtx, value: string): string {
  const { db, now } = ctx;
  const existing = db
    .query<{ _id: string }, [string]>(`SELECT _id FROM node_labels WHERE value = ?`)
    .get(value);
  if (existing) return existing._id;
  const id = ids.nodeLabel(value);
  db.run(`INSERT INTO node_labels (_id, _ts_created, value, description) VALUES (?, ?, ?, ?)`, [
    id,
    now,
    value,
    "",
  ]);
  return id;
}
