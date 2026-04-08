import type { MutationCtx } from "../api/merge-memory";
import { clearMemorySubtree, ids } from ".";
import type { DbCtx } from "./context";

export interface DeleteMemoryParams {
  namespace: string;
  key: string;
}

/**
 * Removes a memory and all dependent rows: vector index rows, FTS, text/vector features, source maps,
 * edges (and edge label assignments via FK cascade), node label assignments, then the `memories` and
 * `nodes` rows. Idempotent when the memory was already absent.
 */
export function deleteMemory(ctx: MutationCtx, params: DeleteMemoryParams): void {
  const { db } = ctx;
  const now = Date.now();
  const d: DbCtx = { db, now };
  const memoryId = ids.memory(params.namespace, params.key);
  const nodeId = ids.node(params.namespace, params.key);

  const run = db.transaction(() => {
    clearMemorySubtree(d, memoryId, nodeId);
    db.run(`DELETE FROM memories WHERE _id = ?`, [memoryId]);
    db.run(`DELETE FROM nodes WHERE _id = ?`, [nodeId]);
  });

  run();
}
