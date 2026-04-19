import type { TextFeatureExportRow } from "@cfd/memories-core/persistence";
import type { DbCtx } from "./context";

/**
 * Denormalized text rows for JSONL export / prefetch (join text_features + source_maps).
 */
export function listTextFeatureExportRowsForMemory(
  ctx: DbCtx,
  memoryId: string,
): TextFeatureExportRow[] {
  return ctx.db
    .prepare(
      `SELECT sm.memory_id AS memory_id, sm.source_key AS source_key, tf.text AS text
       FROM text_features tf
       INNER JOIN source_maps sm ON tf.source_map_id = sm._id
       WHERE sm.memory_id = ?`,
    )
    .all(memoryId) as TextFeatureExportRow[];
}
