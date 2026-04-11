import { ids } from "@cfd/memories-core";
import { documentValidator } from "../_lib";
import { schema } from "../schema";
import type { DbCtx } from "./context";

export function insertTextFeatureWithFts(
  ctx: DbCtx,
  input: { memoryId: string; sourceMapId: string; text: string },
): { textFeatureId: string } {
  const { db, now } = ctx;
  const textFeatureId = ids.textFeature(input.sourceMapId);
  const doc = documentValidator(schema, "text_features");
  doc.parse({
    _id: textFeatureId,
    _ts_created: now,
    memory_id: input.memoryId,
    source_map_id: input.sourceMapId,
    text: input.text,
  });
  db.run(
    `INSERT INTO text_features (_id, _ts_created, memory_id, source_map_id, text) VALUES (?, ?, ?, ?, ?)`,
    [textFeatureId, now, input.memoryId, input.sourceMapId, input.text],
  );
  db.run(
    `INSERT INTO text_features_fts (text_feature_id, memory_id, source_map_id, text) VALUES (?, ?, ?, ?)`,
    [textFeatureId, input.memoryId, input.sourceMapId, input.text],
  );
  return { textFeatureId };
}
