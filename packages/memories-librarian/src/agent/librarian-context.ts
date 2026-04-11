import type { ToolkitContext, ToolRuntimeContext } from "@cfd/agent-identity";
import type { MemoriesClient, MemoriesClientAsync } from "@cfd/memories-core";
import type z from "zod";
import type { EmbeddingModel } from "../adapters/embedding-model";
import type {
  MemoryLibrarianEnv,
  MemoryLibrarianWideClient,
  MemoryLibrarianWideClientAsync,
} from "./toolkit";

/**
 * Narrows a session {@link MemoriesClient} or {@link MemoriesClientAsync} to the wide shape expected by {@link memoryLibrarianToolkit}.
 * Single boundary for assignability (clients are invariant in ontology generics).
 */
export function toMemoryLibrarianEnv<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  /** Per session; defaults to a new empty map. */
  embeddingCache?: Map<string, number[]>;
}): MemoryLibrarianEnv {
  return {
    client: args.client as unknown as MemoryLibrarianWideClient | MemoryLibrarianWideClientAsync,
    namespace: args.namespace,
    embeddingModel: args.embeddingModel,
    embeddingCache: args.embeddingCache ?? new Map(),
  };
}

export function buildMemoryLibrarianToolkitContext<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  agentId?: string;
  agentName?: string;
}): ToolkitContext<MemoryLibrarianEnv> {
  return {
    env: toMemoryLibrarianEnv(args),
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
  };
}

export function buildMemoryLibrarianToolRuntimeContext<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
  agentId?: string;
  agentName?: string;
}): ToolRuntimeContext<MemoryLibrarianEnv> {
  return {
    env: toMemoryLibrarianEnv(args),
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
  };
}
