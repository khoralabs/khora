import { ids } from "@cfd/memories-core";
import { documentValidator } from "../_lib";
import { memoriesPersistenceDocumentSchema } from "@cfd/memories-core/persistence";
import type { DbCtx } from "./context";

export function findMemoryIdByKey(ctx: DbCtx, namespace: string, key: string): string | undefined {
  const row = ctx.db
    .query<{ _id: string }, [string, string]>(
      `SELECT _id FROM memories WHERE namespace = ? AND key = ?`,
    )
    .get(namespace, key);
  return row?._id;
}

/**
 * Upserts `memories` by deterministic id; preserves `_ts_created` when the row already exists.
 */
export function upsertMemory(
  ctx: DbCtx,
  input: { namespace: string; key: string },
): {
  memoryId: string;
  _ts_created: number;
} {
  const { db, now } = ctx;
  const memoryId = ids.memory(input.namespace, input.key);
  const doc = documentValidator(memoriesPersistenceDocumentSchema, "memories");
  doc.parse({
    _id: memoryId,
    _ts_created: now,
    namespace: input.namespace,
    key: input.key,
  });
  const existingTs = db
    .query<{ _ts_created: number }, [string]>(`SELECT _ts_created FROM memories WHERE _id = ?`)
    .get(memoryId);
  const tsCreated = existingTs?._ts_created ?? now;
  db.run(
    `INSERT INTO memories (_id, _ts_created, namespace, key) VALUES (?, ?, ?, ?)
     ON CONFLICT(_id) DO UPDATE SET namespace = excluded.namespace, key = excluded.key`,
    [memoryId, tsCreated, input.namespace, input.key],
  );
  return { memoryId, _ts_created: tsCreated };
}
