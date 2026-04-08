import type { AgentRegistry } from "@cfd/agent-identity";
import {
  type MemoriesClient,
  type ResolvedSource,
  resolveSourcemap,
  type Store,
  type TypedSearchHit,
} from "@cfd/memories";
import type { LanguageModel } from "ai";
import type z from "zod";
import type { EmbeddingModel } from "../adapters";
import {
  createAgentRegistry,
  defineMemoryLibrarianIdentity,
  memoryLibrarianRegistryRegistration,
} from "../agent";
import type {
  LibrarianPipelineGeneration,
  MemoryLibrarianSessionInput,
  MemoryLibrarianSessionOutput,
} from "../agent";
import {
  decomposeLogicalMemoryToContent,
  type LogicalMemoryInput,
  type ProcessedLogicalMemory,
} from "./logical-memory";
import { prefetchRelatedMemories } from "./organize";
import type { LibrarianMergePlanWire } from "./plan";

export type { LibrarianPipelineGeneration };

export interface ProcessLogicalMemoryWithLibrarianParams<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> {
  /** AI SDK language model (caller-supplied provider). */
  model: LanguageModel;
  client: MemoriesClient<TNode, TEdge>;
  /** Same model used for ingestion / `memory_search` vector arm. */
  embeddingModel: EmbeddingModel;
  logicalMemory: LogicalMemoryInput;
  /** Resolves each prefetched hit’s {@link SourceMap} to readable source material. */
  store: Store;
  /** Run per-chunk prefetch search before the model turn (default: true). */
  prefetch?: boolean;
  /** Max agent steps for tool calls + structured output (default: 12). */
  maxSteps?: number;
  /** When false, validate and return the plan without calling {@link mergeLogicalMemoryWithPlan}. */
  runMerge?: boolean;
  agentId?: string;
  agentName?: string;
  /** When set, registers the static librarian identity for this namespace before generation. */
  agentRegistry?: AgentRegistry;
}

export interface ProcessLogicalMemoryResult<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> {
  processedLogicalMemory: ProcessedLogicalMemory;
  prefetchedHits: TypedSearchHit<TNode, TEdge>[];
  resolvedSources: Array<{
    hit: TypedSearchHit<TNode, TEdge>;
    source: ResolvedSource;
  }>;
  plan: LibrarianMergePlanWire;
  /** Full AI SDK result (tool calls, usage, structured output). */
  generation: LibrarianPipelineGeneration;
}

/**
 * End-to-end librarian pipeline: decompose → optional prefetch + resolve sources → AI SDK (tools + structured plan) → merge.
 */
export async function processLogicalMemoryWithLibrarian<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(
  params: ProcessLogicalMemoryWithLibrarianParams<TNode, TEdge>,
): Promise<ProcessLogicalMemoryResult<TNode, TEdge>> {
  const {
    model,
    client,
    embeddingModel,
    logicalMemory,
    store,
    prefetch = true,
    maxSteps = 12,
    runMerge = true,
    agentId,
    agentName,
    agentRegistry,
  } = params;

  const content = await decomposeLogicalMemoryToContent(logicalMemory);
  const processedLogicalMemory: ProcessedLogicalMemory = { ...logicalMemory, content };

  const prefetchedHits = prefetch
    ? prefetchRelatedMemories(client, logicalMemory.namespace, content)
    : [];

  const resolvedSources: ProcessLogicalMemoryResult<TNode, TEdge>["resolvedSources"] = [];
  for (const hit of prefetchedHits) {
    const source = await resolveSourcemap(hit, store);
    resolvedSources.push({ hit, source });
  }

  const { identity } = await defineMemoryLibrarianIdentity(logicalMemory.namespace);
  const registry = agentRegistry ?? createAgentRegistry();
  registry.register(identity, memoryLibrarianRegistryRegistration<TNode, TEdge>());
  const session = registry.createSession(identity.agentId, {
    ctx: {
      model,
      client,
      embeddingModel,
      agentId,
      agentName,
    },
  });

  const { generation, plan } = await session.start<
    MemoryLibrarianSessionInput<TNode, TEdge>,
    MemoryLibrarianSessionOutput
  >({
    logicalMemory,
    processedLogicalMemory,
    prefetchedHits,
    resolvedSources,
    runMerge,
    maxSteps,
  });

  return {
    processedLogicalMemory,
    prefetchedHits,
    resolvedSources,
    plan,
    generation,
  };
}
