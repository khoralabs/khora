import { ids } from "@cfd/memories";
import { schema } from "@cfd/memories/db/schema";
import { documentValidator } from "../_lib";
import { vectorToBlob } from "../connection";
import { ensureVectorFeaturesVecTable, vectorVecTableName } from "../search-indexes";
import type { DbCtx } from "./context";

export function insertVectorFeatureWithVecIndex(
  ctx: DbCtx,
  input: { memoryId: string; sourceMapId: string; vector: Float32Array },
): { vectorFeatureId: string } {
  const { db, now } = ctx;
  const vectorFeatureId = ids.vectorFeature(input.sourceMapId);
  const doc = documentValidator(schema, "vector_features");
  const parsed = doc.safeParse({
    _id: vectorFeatureId,
    _ts_created: now,
    memory_id: input.memoryId,
    source_map_id: input.sourceMapId,
    vector: Array.from(input.vector),
  });
  if (!parsed.success) {
    throw new Error(`vector_features validation failed: ${parsed.error.message}`);
  }
  const vfRow = parsed.data;
  const dim = input.vector.length;
  const blob = vectorToBlob(input.vector);
  db.run(
    `INSERT INTO vector_features (_id, _ts_created, memory_id, source_map_id, vector) VALUES (?, ?, ?, ?, ?)`,
    [vfRow._id, vfRow._ts_created, vfRow.memory_id, vfRow.source_map_id, blob],
  );
  ensureVectorFeaturesVecTable(db, dim);
  const vTable = vectorVecTableName(dim).replaceAll('"', '""');
  db.run(`INSERT INTO "${vTable}" (vector_feature_id, memory_id, embedding) VALUES (?, ?, ?)`, [
    vfRow._id,
    input.memoryId,
    input.vector,
  ]);
  return { vectorFeatureId };
}
