import { ids, namespaceLevelFields, namespacePath } from "@cfd/memories-core";
import { memoriesPersistenceDocumentSchema } from "@cfd/memories-core/persistence";
import { documentValidator } from "../_lib";
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
  const levels = namespaceLevelFields(namespacePath(input.namespace));
  doc.parse({
    _id: memoryId,
    _ts_created: now,
    namespace: input.namespace,
    key: input.key,
    ...levels,
  });
  const existingTs = db
    .query<{ _ts_created: number }, [string]>(`SELECT _ts_created FROM memories WHERE _id = ?`)
    .get(memoryId);
  const tsCreated = existingTs?._ts_created ?? now;
  db.run(
    `INSERT INTO memories (_id, _ts_created, namespace, key, ns_l0, ns_l1, ns_l2, ns_l3, ns_l4, ns_l5)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(_id) DO UPDATE SET
       namespace = excluded.namespace,
       key = excluded.key,
       ns_l0 = excluded.ns_l0,
       ns_l1 = excluded.ns_l1,
       ns_l2 = excluded.ns_l2,
       ns_l3 = excluded.ns_l3,
       ns_l4 = excluded.ns_l4,
       ns_l5 = excluded.ns_l5`,
    [
      memoryId,
      tsCreated,
      input.namespace,
      input.key,
      levels.ns_l0 ?? null,
      levels.ns_l1 ?? null,
      levels.ns_l2 ?? null,
      levels.ns_l3 ?? null,
      levels.ns_l4 ?? null,
      levels.ns_l5 ?? null,
    ],
  );
  return { memoryId, _ts_created: tsCreated };
}
