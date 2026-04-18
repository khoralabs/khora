import { ids } from "@cfd/memories-core";
import { memoriesPersistenceDocumentSchema } from "@cfd/memories-core/persistence";
import { documentValidator, jsonOrNull } from "../_lib";
import type { DbCtx } from "./context";

export function upsertNodeForMemoryKey(
  ctx: DbCtx,
  input: { namespace: string; memoryKey: string; properties?: Record<string, unknown> },
): { nodeId: string } {
  const { db, now } = ctx;
  const nodeId = ids.node(input.namespace, input.memoryKey);
  const doc = documentValidator(memoriesPersistenceDocumentSchema, "nodes");
  doc.parse({
    _id: nodeId,
    _ts_created: now,
    value: input.memoryKey,
    properties: input.properties,
  });
  db.run(
    `INSERT INTO nodes (_id, _ts_created, value, properties) VALUES (?, ?, ?, ?)
     ON CONFLICT(_id) DO UPDATE SET value = excluded.value, properties = excluded.properties`,
    [nodeId, now, input.memoryKey, jsonOrNull(input.properties)],
  );
  return { nodeId };
}

export function nodeExists(ctx: DbCtx, nodeId: string): boolean {
  const row = ctx.db
    .query<{ _id: string }, [string]>(`SELECT _id FROM nodes WHERE _id = ?`)
    .get(nodeId);
  return row != null;
}
