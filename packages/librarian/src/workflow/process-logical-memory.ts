import type { AgentRegistry } from "@cfd/agent-identity";
import {
  type MemoriesClient,
  type MemoriesClientAsync,
  type ResolvedSource,
  resolveSourcemap,
  type Store,
  type TypedSearchHit,
} from "@cfd/memories";
import type { LanguageModel } from "ai";
import type z from "zod";
import type { EmbeddingModel } from "../adapters";
import type {
  LibrarianPipelineGeneration,
  MemoryLibrarianSessionInput,
  MemoryLibrarianSessionOutput,
} from "../agent";
import { createAgentRegistry, registerMemoryLibrarianAgent } from "../agent";
import { logger } from "../telemetry/logger.js";
import { librarianLog } from "../telemetry/payloads.js";
import { elapsedMs } from "../timing.js";
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
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  /**
   * Same embedding model for decomposition, prefetch search vectors, tool `memory_search`, and merge payloads.
   * Set {@link EmbeddingModel.embedConfig} (e.g. `outputDimensionality`) for resolution recipes.
   */
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
 *
 * Uses {@link declareMemoryLibrarianAgent} then `registry.register(identity, registration)` and
 * `createSession(agentId, { ctx }).start(...)` — session orchestration is the runner (`SessionRunner`); `ctx` supplies model/client/embedding.
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

  const pipelineT0 = performance.now();

  const tDecompose = performance.now();
  const content = await decomposeLogicalMemoryToContent({
    ...logicalMemory,
    embedding: {
      ...logicalMemory.embedding,
      embeddingModel,
    },
  });
  const processedLogicalMemory: ProcessedLogicalMemory = { ...logicalMemory, content };
  logger.info(
    librarianLog("librarian.remember.decompose", {
      processTimeMs: elapsedMs(tDecompose),
      mergeChunkCount: content.length,
      namespace: logicalMemory.namespace,
    }),
  );

  const tPrefetch = performance.now();
  const prefetchedHits = prefetch
    ? await prefetchRelatedMemories(client, logicalMemory.namespace, content)
    : [];
  logger.info(
    librarianLog("librarian.remember.prefetchSearch", {
      processTimeMs: elapsedMs(tPrefetch),
      mergeChunkCount: content.length,
      prefetchHitCount: prefetchedHits.length,
      skipped: !prefetch,
    }),
  );

  const tResolve = performance.now();
  const resolvedSources: ProcessLogicalMemoryResult<TNode, TEdge>["resolvedSources"] = [];
  for (const hit of prefetchedHits) {
    const source = await resolveSourcemap(hit, store);
    resolvedSources.push({ hit, source });
  }
  logger.info(
    librarianLog("librarian.remember.resolveSources", {
      processTimeMs: elapsedMs(tResolve),
      resolvedCount: resolvedSources.length,
    }),
  );

  const tRegister = performance.now();
  const registry = agentRegistry ?? createAgentRegistry();
  const { identity } = await registerMemoryLibrarianAgent<TNode, TEdge>(
    registry,
    logicalMemory.namespace,
    client.ontology,
  );
  logger.info(
    librarianLog("librarian.remember.registerAgent", {
      processTimeMs: elapsedMs(tRegister),
      agentId: identity.agentId,
    }),
  );

  const tSession = performance.now();
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
  logger.info(
    librarianLog("librarian.remember.sessionStart", {
      processTimeMs: elapsedMs(tSession),
      agentId: identity.agentId,
      maxSteps,
    }),
  );

  logger.info(
    librarianLog("librarian.remember.pipeline", {
      processTimeMs: elapsedMs(pipelineT0),
      namespace: logicalMemory.namespace,
    }),
  );

  return {
    processedLogicalMemory,
    prefetchedHits,
    resolvedSources,
    plan,
    generation,
  };
}
