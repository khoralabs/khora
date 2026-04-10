import { deleteVectorVecRowsForMemory } from "../search-indexes";
import type { DbCtx } from "./context";

/** Removes features, FTS, vec index rows, edges, and node-label links for one memory (not the memory/node rows). */
export function clearMemorySubtree(ctx: DbCtx, memoryId: string, nodeId: string): void {
  const { db } = ctx;
  deleteVectorVecRowsForMemory(db, memoryId);
  db.run(`DELETE FROM text_features_fts WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM text_features WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM vector_features WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM source_maps WHERE memory_id = ?`, [memoryId]);
  db.run(`DELETE FROM edges WHERE from_node_id = ? OR to_node_id = ?`, [nodeId, nodeId]);
  db.run(`DELETE FROM node_label_assignments WHERE node_id = ?`, [nodeId]);
}
