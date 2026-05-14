import {
  AGENT_RELAY_EVENT_KIND,
  type AgentRelayAppEventConstraint,
  type AgentRelayEventHandlerCtx,
  type AgentRelayEventUnion,
} from "@khoralabs/agent-relay";
import type { DefaultEntityMap, LabelSchemaMap, MemoriesClient } from "@khoralabs/memories-core";
import {
  createSwarmMemoriesSyncHandler,
  type SwarmMemoryOpMapper,
} from "./atrium-swarm-memory-ops.ts";

export type { SwarmMemoryOp, SwarmMemoryOpMapper } from "./atrium-swarm-memory-ops.ts";
export { createSwarmMemoriesSyncHandler } from "./atrium-swarm-memory-ops.ts";

/**
 * Runs Memories merge/delete projection before each non-registration event, then `handler`.
 * Compose with {@link import("@khoralabs/agent-relay").AgentRelayDeps.onEvent} when mapping swarm events to Memories.
 */
export function composeOnEventWithMemorySync<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TEntityMap extends Record<string, unknown> = DefaultEntityMap,
  TProfile = unknown,
  TPost = unknown,
  TTopic = unknown,
  TAppEvent extends AgentRelayAppEventConstraint = never,
>(
  memories: MemoriesClient<TNode, TEdge, TEntityMap>,
  mapMemoryOps: SwarmMemoryOpMapper<TNode, TEdge, TProfile, TPost, TTopic, TAppEvent>,
  handler: (
    ctx: AgentRelayEventHandlerCtx,
    event: AgentRelayEventUnion<TProfile, TPost, TTopic, TAppEvent>,
  ) => void | Promise<void>,
): (
  ctx: AgentRelayEventHandlerCtx,
  event: AgentRelayEventUnion<TProfile, TPost, TTopic, TAppEvent>,
) => void | Promise<void> {
  const sync = createSwarmMemoriesSyncHandler(memories, mapMemoryOps);
  return async (ctx, event) => {
    if (event.kind !== AGENT_RELAY_EVENT_KIND.REGISTRATION_PROFILE_BUILD) {
      await sync(event);
    }
    return handler(ctx, event);
  };
}
