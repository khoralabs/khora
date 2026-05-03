import type { MutationCtxAsync } from "../api/merge-memory-async";
import type { DeleteMemoryParams } from "./delete-memory";
import { ids } from "./ids";

/** Async variant of {@link deleteMemory}. */
export async function deleteMemoryAsync(
  ctx: MutationCtxAsync,
  params: DeleteMemoryParams,
): Promise<void> {
  const { persistence } = ctx;
  const now = Date.now();
  const op = { now };
  const memoryId = ids.memory(params.namespace, params.key);
  const nodeId = ids.node(params.namespace, params.key);

  await persistence.withTransaction(async () => {
    if ((await persistence.findMemoryIdByKey(params.namespace, params.key)) === undefined) {
      return;
    }
    await persistence.clearMemorySubtree(op, memoryId, nodeId);
    await persistence.deleteMemoryRootRows(memoryId, nodeId);
    await persistence.appendProvenanceEvent(op, {
      v: 1,
      kind: "DELETE_MEMORY",
      namespace: params.namespace,
      memory_key: params.key,
      memory_id: memoryId,
    });
  });
}
