import { ids } from "@cfd/memories-core";
import { memoriesPersistenceDocumentSchema } from "@cfd/memories-core/persistence";
import { documentValidator } from "../_lib";
import type { DbCtx } from "./context";

export function insertSourceMap(
  ctx: DbCtx,
  input: { memoryId: string; sourceKey: string },
): {
  sourceMapId: string;
} {
  const { db, now } = ctx;
  const sourceMapId = ids.sourceMap(input.memoryId, input.sourceKey);
  const doc = documentValidator(memoriesPersistenceDocumentSchema, "source_maps");
  doc.parse({
    _id: sourceMapId,
    _ts_created: now,
    memory_id: input.memoryId,
    source_key: input.sourceKey,
  });
  db.run(`INSERT INTO source_maps (_id, _ts_created, memory_id, source_key) VALUES (?, ?, ?, ?)`, [
    sourceMapId,
    now,
    input.memoryId,
    input.sourceKey,
  ]);
  return { sourceMapId };
}
