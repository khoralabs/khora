import type {
  DefaultEntityMap,
  DeleteMemoryParams,
  LabelSchemaMap,
  MemoriesClient,
  MergeMemoryParams,
} from "@khoralabs/memories-core";
import type { SwarmAppEventConstraint, SwarmHostEventUnion } from "@khoralabs/swarm-host";

/** Single merge or delete applied by a Memories sync loop. */
export type SwarmMemoryOp<
  TNode extends LabelSchemaMap = LabelSchemaMap,
  TEdge extends LabelSchemaMap = LabelSchemaMap,
> =
  | { op: "merge"; params: MergeMemoryParams<TNode, TEdge> }
  | { op: "delete"; params: DeleteMemoryParams };

/** Pure projection from a host event to memory operations (empty = no effect). */
export type SwarmMemoryOpMapper<
  TNode extends LabelSchemaMap = LabelSchemaMap,
  TEdge extends LabelSchemaMap = LabelSchemaMap,
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
> = (
  event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>,
) => SwarmMemoryOp<TNode, TEdge>[] | Promise<SwarmMemoryOp<TNode, TEdge>[]>;

export type SwarmMemoriesSyncHandler<
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
> = (event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>) => void | Promise<void>;

/**
 * Compose a {@link SwarmMemoriesSyncHandler} from a mapper; builders typically supply only `mapEvent`.
 */
export function createSwarmMemoriesSyncHandler<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
>(
  client: MemoriesClient<TNode, TEdge, TEntityMap>,
  mapEvent: SwarmMemoryOpMapper<TNode, TEdge, TProfile, TPost, TTopic, TAppEvent>,
): SwarmMemoriesSyncHandler<TProfile, TPost, TTopic, TAppEvent> {
  return async (event) => {
    const ops = await Promise.resolve(mapEvent(event));
    for (const step of ops) {
      if (step.op === "merge") {
        client.mergeMemory(step.params);
      } else {
        client.deleteMemory(step.params);
      }
    }
  };
}
