import type { Database } from "bun:sqlite";
import type { SourceMap } from "@cfd/memories-core";

/**
 * Most recently created source maps for a memory (for bounded resolution / display).
 */
export function listSourceMapsForMemory(
  db: Database,
  memoryId: string,
  limit: number,
): SourceMap[] {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError("limit must be a positive integer");
  }
  return db
    .prepare(
      `SELECT _id, _ts_created, memory_id, source_key
       FROM source_maps
       WHERE memory_id = ?
       ORDER BY _ts_created DESC
       LIMIT ?`,
    )
    .all(memoryId, limit) as SourceMap[];
}
