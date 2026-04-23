import {
  evaluateRegisteredAgentAffordances,
  type RegisteredAgentAffordances,
  type RegisteredAgentIdentity,
  type ToolkitContext,
  type ToolRuntimeContext,
} from "@cfd/agent-identity";
import type { MemoriesClient, MemoriesClientAsync } from "@cfd/memories-core";
import type z from "zod";
import type { EmbeddingModel } from "./embedding-types.js";
import type {
  MemorySearchEnv,
  MemorySearchWideClient,
  MemorySearchWideClientAsync,
} from "./memory-search-toolkit.js";

/** Zod object shape for a label map (node or edge) in session typing. */
export type ZodLabelMap = Record<string, z.ZodType>;

/**
 * Shared fields for memory-search session context: toolkit, runtime, and evaluated affordances.
 * Agents extend this with their own {@link @cfd/agent-identity!SessionContext} + model, etc.
 */
export type MemorySearchSessionContextSlice<
  TNode extends ZodLabelMap = ZodLabelMap,
  TEdge extends ZodLabelMap = ZodLabelMap,
> = {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  agentId?: string;
  agentName?: string;
  memorySearchBudgetMax?: number;
  toolkitCtx?: ToolkitContext<MemorySearchEnv>;
  runtime?: ToolRuntimeContext<MemorySearchEnv>;
  affordances?: RegisteredAgentAffordances;
};

function memorySearchContextBuildArgs<TNode extends ZodLabelMap, TEdge extends ZodLabelMap>(
  context: MemorySearchSessionContextSlice<TNode, TEdge>,
) {
  return {
    client: context.client,
    namespace: context.namespace,
    embeddingModel: context.embeddingModel,
    agentId: context.agentId,
    agentName: context.agentName,
    ...(context.memorySearchBudgetMax !== undefined
      ? { memorySearchBudgetMax: context.memorySearchBudgetMax }
      : {}),
  } as {
    client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
    namespace: string;
    embeddingModel: EmbeddingModel;
    agentId?: string;
    agentName?: string;
    memorySearchBudgetMax?: number;
  };
}

/**
 * Returns both {@link buildMemorySearchToolkitContext} and {@link buildMemorySearchToolRuntimeContext} for the same inputs.
 */
export function buildMemorySearchToolkitAndRuntime<
  TNode extends ZodLabelMap,
  TEdge extends ZodLabelMap,
>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  agentId?: string;
  agentName?: string;
  memorySearchBudgetMax?: number;
}): { toolkitCtx: ToolkitContext<MemorySearchEnv>; runtime: ToolRuntimeContext<MemorySearchEnv> } {
  return {
    toolkitCtx: buildMemorySearchToolkitContext(args),
    runtime: buildMemorySearchToolRuntimeContext(args),
  };
}

/**
 * Sets {@code toolkitCtx}, {@code runtime}, and {@code affordances} on session context (for {@code onAfterContext}).
 * Generics line up with ontology-scoped session types (e.g. {@code MemorySearchSessionContextSlice}{@code <TNode, TEdge>})
 * so callers do not need to widen to {@code ZodLabelMap}.
 */
export async function attachMemorySearchSessionLayer<
  TNode extends ZodLabelMap,
  TEdge extends ZodLabelMap,
>(args: {
  agent: RegisteredAgentIdentity;
  context: MemorySearchSessionContextSlice<TNode, TEdge>;
}): Promise<void> {
  const { agent, context: ctx } = args;
  const shared = memorySearchContextBuildArgs<TNode, TEdge>(ctx);
  const { toolkitCtx, runtime } = buildMemorySearchToolkitAndRuntime(shared);
  ctx.toolkitCtx = toolkitCtx;
  ctx.runtime = runtime;
  ctx.affordances = await evaluateRegisteredAgentAffordances(agent, toolkitCtx);
}

/**
 * Narrows a session {@link MemoriesClient} or {@link MemoriesClientAsync} to the wide shape expected by {@link memorySearchToolkit}.
 * Single boundary for assignability (clients are invariant in ontology generics).
 */
export function toMemorySearchEnv<TNode extends ZodLabelMap, TEdge extends ZodLabelMap>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  /** Per session; defaults to a new empty map. */
  embeddingCache?: Map<string, number[]>;
  /** When set, initializes {@link MemorySearchEnv.memorySearchBudget} with {@code used: 0}. */
  memorySearchBudgetMax?: number;
}): MemorySearchEnv {
  const memorySearchBudget =
    args.memorySearchBudgetMax !== undefined
      ? { max: args.memorySearchBudgetMax, used: 0 }
      : undefined;
  return {
    memoriesClient: args.client as unknown as MemorySearchWideClient | MemorySearchWideClientAsync,
    namespace: args.namespace,
    embeddingModel: args.embeddingModel,
    embeddingCache: args.embeddingCache ?? new Map(),
    ...(memorySearchBudget !== undefined ? { memorySearchBudget } : {}),
  };
}

export function buildMemorySearchToolkitContext<
  TNode extends ZodLabelMap,
  TEdge extends ZodLabelMap,
>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  agentId?: string;
  agentName?: string;
  memorySearchBudgetMax?: number;
}): ToolkitContext<MemorySearchEnv> {
  return {
    env: toMemorySearchEnv(args),
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
  };
}

export function buildMemorySearchToolRuntimeContext<
  TNode extends ZodLabelMap,
  TEdge extends ZodLabelMap,
>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  agentId?: string;
  agentName?: string;
  memorySearchBudgetMax?: number;
}): ToolRuntimeContext<MemorySearchEnv> {
  return {
    env: toMemorySearchEnv(args),
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
  };
}
