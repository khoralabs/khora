import type { SourceMap } from "@cfd/memories-core/db/rows";
import type { DbCtx } from "./context";

/**
 * Most recently created source maps for a memory (bounded).
 */
export function listSourceMapsForMemory(ctx: DbCtx, memoryId: string, limit: number): SourceMap[] {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError("limit must be a positive integer");
  }
  return ctx.db
    .prepare(
      `SELECT _id, _ts_created, memory_id, source_key
       FROM source_maps
       WHERE memory_id = ?
       ORDER BY _ts_created DESC
       LIMIT ?`,
    )
    .all(memoryId, limit) as SourceMap[];
}
