import type { ToolkitContext, ToolRuntimeContext } from "@cfd/agent-identity";
import type { MemoriesClient, MemoriesClientAsync } from "@cfd/memories-core";
import type z from "zod";
import type { EmbeddingModel } from "./embedding-types.js";
import type {
  MemorySearchEnv,
  MemorySearchWideClient,
  MemorySearchWideClientAsync,
} from "./memory-search-toolkit.js";

/**
 * Narrows a session {@link MemoriesClient} or {@link MemoriesClientAsync} to the wide shape expected by {@link memorySearchToolkit}.
 * Single boundary for assignability (clients are invariant in ontology generics).
 */
export function toMemorySearchEnv<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  /** Per session; defaults to a new empty map. */
  embeddingCache?: Map<string, number[]>;
}): MemorySearchEnv {
  return {
    client: args.client as unknown as MemorySearchWideClient | MemorySearchWideClientAsync,
    namespace: args.namespace,
    embeddingModel: args.embeddingModel,
    embeddingCache: args.embeddingCache ?? new Map(),
  };
}

export function buildMemorySearchToolkitContext<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  agentId?: string;
  agentName?: string;
}): ToolkitContext<MemorySearchEnv> {
  return {
    env: toMemorySearchEnv(args),
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
  };
}

export function buildMemorySearchToolRuntimeContext<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  agentId?: string;
  agentName?: string;
}): ToolRuntimeContext<MemorySearchEnv> {
  return {
    env: toMemorySearchEnv(args),
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
  };
}
