import type { ToolkitContext, ToolRuntimeContext } from "@cfd/agent-identity";
import type { MemoriesClient } from "@cfd/memories";
import type z from "zod";
import type { EmbeddingModel } from "../adapters/embedding-model";
import type { MemoryLibrarianEnv, MemoryLibrarianWideClient } from "./toolkit";

/**
 * Narrows a session {@link MemoriesClient} to the wide shape expected by {@link memoryLibrarianToolkit}.
 * Single boundary for assignability (MemoriesClient is invariant in ontology generics).
 */
export function toMemoryLibrarianEnv<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(args: {
  client: MemoriesClient<TNode, TEdge>;
  namespace: string;
  embeddingModel: EmbeddingModel;
}): MemoryLibrarianEnv {
  return {
    client: args.client as unknown as MemoryLibrarianWideClient,
    namespace: args.namespace,
    embeddingModel: args.embeddingModel,
  };
}

export function buildMemoryLibrarianToolkitContext<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(args: {
  client: MemoriesClient<TNode, TEdge>;
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
  client: MemoriesClient<TNode, TEdge>;
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
