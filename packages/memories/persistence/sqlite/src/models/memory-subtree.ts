import { deleteVectorVecRowsForMemory } from "../search-indexes";
import type { DbCtx } from "./context";

/** Removes features, FTS, vec index rows, edges, and node-label links for one **node** memory. */
function clearNodeMemorySubtree(ctx: DbCtx, memoryId: string, nodeId: string): void {
  const { db } = ctx;
  deleteVectorVecRowsForMemory(db, memoryId);
  db.run(`DELETE FROM text_features_fts WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM text_features WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM vector_features WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM source_maps WHERE memory_id = ?`, [memoryId]);

  /** Edge-attached memories referencing incident edges (handled explicitly when `edge_id` column exists). */
  try {
    db.run(
      `DELETE FROM memories WHERE edge_id IN (
         SELECT _id FROM edges WHERE from_node_id = ? OR to_node_id = ?
       )`,
      [nodeId, nodeId],
    );
  } catch {
    /* pre-migration DBs without edge_id */
  }

  db.run(`DELETE FROM edges WHERE from_node_id = ? OR to_node_id = ?`, [nodeId, nodeId]);
  db.run(`DELETE FROM node_label_assignments WHERE node_id = ?`, [nodeId]);
}

/** Clears indexed features and edge label assignments for an **edge** memory; keeps the `edges` row for merge re-insert. */
function clearEdgeMemorySubtree(ctx: DbCtx, memoryId: string, edgeId: string): void {
  const { db } = ctx;
  deleteVectorVecRowsForMemory(db, memoryId);
  db.run(`DELETE FROM text_features_fts WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM text_features WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM vector_features WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM source_maps WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM edge_label_assignments WHERE edge_id = ?`, [edgeId]);
}

/**
 * Removes features, FTS, vec index, and graph-linked rows for one memory.
 * See {@link MemoriesMutationCore.clearMemorySubtree} in core for semantics.
 */
export function clearMemorySubtree(
  ctx: DbCtx,
  input:
    | { memoryKind: "node"; memoryId: string; nodeId: string }
    | { memoryKind: "edge"; memoryId: string; edgeId: string },
): void {
  if (input.memoryKind === "node") {
    clearNodeMemorySubtree(ctx, input.memoryId, input.nodeId);
  } else {
    clearEdgeMemorySubtree(ctx, input.memoryId, input.edgeId);
  }
}
