import { ids, namespacePath, namespacePrefixFields } from "@cfd/memories-core";
import type { MemoryKind } from "@cfd/memories-core/persistence";
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

export function findMemoryAssociation(
  ctx: DbCtx,
  namespace: string,
  key: string,
):
  | { memoryId: string; kind: "node"; nodeId: string }
  | { memoryId: string; kind: "edge"; edgeId: string }
  | undefined {
  const memoryId = ids.memory(namespace, key);
  const row = ctx.db
    .query<{ kind: string; edge_id: string | null }, [string]>(
      `SELECT kind, edge_id FROM memories WHERE _id = ?`,
    )
    .get(memoryId);
  if (!row) return undefined;
  if (row.kind === "edge") {
    if (!row.edge_id) {
      throw new Error(`findMemoryAssociation: edge memory missing edge_id for key=${key}`);
    }
    return { memoryId, kind: "edge", edgeId: row.edge_id };
  }
  return { memoryId, kind: "node", nodeId: ids.node(namespace, key) };
}

/**
 * Upserts `memories` by deterministic id; preserves `_ts_created` when the row already exists.
 */
export function upsertMemory(
  ctx: DbCtx,
  input: {
    namespace: string;
    key: string;
    kind?: MemoryKind;
    edgeId?: string | null;
  },
): {
  memoryId: string;
  _ts_created: number;
} {
  const { db, now } = ctx;
  const memoryId = ids.memory(input.namespace, input.key);
  const kind: MemoryKind = input.kind ?? "node";
  const edgeId = kind === "edge" ? (input.edgeId ?? null) : null;
  const doc = documentValidator(memoriesPersistenceDocumentSchema, "memories");
  const prefixes = namespacePrefixFields(namespacePath(input.namespace));
  doc.parse({
    _id: memoryId,
    _ts_created: now,
    namespace: input.namespace,
    key: input.key,
    kind,
    edge_id: edgeId ?? undefined,
    ...prefixes,
  });
  const existingTs = db
    .query<{ _ts_created: number }, [string]>(`SELECT _ts_created FROM memories WHERE _id = ?`)
    .get(memoryId);
  const tsCreated = existingTs?._ts_created ?? now;
  db.run(
    `INSERT INTO memories (_id, _ts_created, namespace, key, kind, edge_id, ns_prefix_1, ns_prefix_2, ns_prefix_3, ns_prefix_4, ns_prefix_5, ns_prefix_6)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(_id) DO UPDATE SET
       namespace = excluded.namespace,
       key = excluded.key,
       kind = excluded.kind,
       edge_id = excluded.edge_id,
       ns_prefix_1 = excluded.ns_prefix_1,
       ns_prefix_2 = excluded.ns_prefix_2,
       ns_prefix_3 = excluded.ns_prefix_3,
       ns_prefix_4 = excluded.ns_prefix_4,
       ns_prefix_5 = excluded.ns_prefix_5,
       ns_prefix_6 = excluded.ns_prefix_6`,
    [
      memoryId,
      tsCreated,
      input.namespace,
      input.key,
      kind,
      edgeId,
      prefixes.ns_prefix_1 ?? null,
      prefixes.ns_prefix_2 ?? null,
      prefixes.ns_prefix_3 ?? null,
      prefixes.ns_prefix_4 ?? null,
      prefixes.ns_prefix_5 ?? null,
      prefixes.ns_prefix_6 ?? null,
    ],
  );
  return { memoryId, _ts_created: tsCreated };
}
