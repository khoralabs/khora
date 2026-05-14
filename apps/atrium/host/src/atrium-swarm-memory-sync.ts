import type {
  DefaultEntityMap,
  LabelSchemaMap,
  MemoriesClient,
} from "@khoralabs/memories-core";
import {
  SWARM_EVENT_KIND,
  type SwarmAppEventConstraint,
  type SwarmHostEventHandlerCtx,
  type SwarmHostEventUnion,
} from "@khoralabs/swarm-host";
import {
  type SwarmMemoryOpMapper,
  createSwarmMemoriesSyncHandler,
} from "./atrium-swarm-memory-ops.ts";

export type { SwarmMemoryOp, SwarmMemoryOpMapper } from "./atrium-swarm-memory-ops.ts";
export { createSwarmMemoriesSyncHandler } from "./atrium-swarm-memory-ops.ts";

/**
 * Runs Memories merge/delete projection before each non-registration event, then `handler`.
 * Compose with {@link import("@khoralabs/swarm-host").SwarmHostDeps.onEvent} when mapping swarm events to Memories.
 */
export function composeOnEventWithMemorySync<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends SwarmAppEventConstraint = never,
>(
  memories: MemoriesClient<TNode, TEdge, TEntityMap>,
  mapMemoryOps: SwarmMemoryOpMapper<TNode, TEdge, TProfile, TPost, TTopic, TAppEvent>,
  handler: (
    ctx: SwarmHostEventHandlerCtx,
    event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>,
  ) => void | Promise<void>,
): (
  ctx: SwarmHostEventHandlerCtx,
  event: SwarmHostEventUnion<TProfile, TPost, TTopic, TAppEvent>,
) => void | Promise<void> {
  const sync = createSwarmMemoriesSyncHandler(memories, mapMemoryOps);
  return async (ctx, event) => {
    if (event.kind !== SWARM_EVENT_KIND.REGISTRATION_PROFILE_BUILD) {
      await sync(event);
    }
    return handler(ctx, event);
  };
}
