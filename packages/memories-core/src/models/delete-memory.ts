import type { MutationCtx } from "../api/merge-memory";
import { ids } from "./ids";

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
  const { persistence } = ctx;
  const now = Date.now();
  const op = { now };
  const memoryId = ids.memory(params.namespace, params.key);
  const nodeId = ids.node(params.namespace, params.key);

  persistence.withTransaction(() => {
    persistence.clearMemorySubtree(op, memoryId, nodeId);
    persistence.deleteMemoryRootRows(memoryId, nodeId);
  });
}
