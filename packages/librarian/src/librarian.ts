import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { AgentRegistry } from "@cfd/agent-identity";
import type { MemoriesClient, MemoriesClientAsync, Store } from "@cfd/memories";
import type { EmbeddingModel as AiSdkEmbeddingModel, LanguageModel } from "ai";
import type z from "zod";
import type { EmbeddingResolutionPreset } from "./adapters/embedding-model.js";
import {
  assertMultimodalEmbeddingModel,
  createLibrarianEmbeddingModel,
  type EmbeddingModel,
  embedTextChunks as embedTextChunksImpl,
  mergeResolutionAndProviderOptions,
} from "./adapters/embedding-model.js";
import type { LogicalMemoryInput } from "./workflow/logical-memory.js";
import type { ProcessLogicalMemoryResult } from "./workflow/process-logical-memory.js";
import { processLogicalMemoryWithLibrarian } from "./workflow/process-logical-memory.js";

export interface LibrarianEmbeddingConfig {
  model: AiSdkEmbeddingModel;
  resolution: EmbeddingResolutionPreset;
  textBatchSize?: number;
  maxParallelCalls?: number;
  providerOptions?: ProviderOptions;
}

export interface LibrarianOptions<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  embedding: LibrarianEmbeddingConfig;
  multimodal: boolean;
}

export type LibrarianProcessLogicalMemoryParams = {
  model: LanguageModel;
  logicalMemory: LogicalMemoryInput;
  store: Store;
  prefetch?: boolean;
  maxSteps?: number;
  runMerge?: boolean;
  agentId?: string;
  agentName?: string;
  agentRegistry?: AgentRegistry;
};

export class Librarian<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> {
  readonly client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  readonly multimodal: boolean;
  readonly #embeddingModel: EmbeddingModel;

  constructor(options: LibrarianOptions<TNode, TEdge>) {
    if (options.multimodal) {
      assertMultimodalEmbeddingModel(options.embedding.model);
    }
    this.client = options.client;
    this.multimodal = options.multimodal;
    this.#embeddingModel = createLibrarianEmbeddingModel({
      model: options.embedding.model,
      textBatchSize: options.embedding.textBatchSize,
      maxParallelCalls: options.embedding.maxParallelCalls,
      providerOptions: mergeResolutionAndProviderOptions(
        options.embedding.resolution,
        options.embedding.providerOptions,
      ),
    });
  }

  /** Resolved embedding model (decomposition, toolkit `memory_search`, merge). */
  getEmbeddingModel(): EmbeddingModel {
    return this.#embeddingModel;
  }

  embedTextChunks(texts: readonly string[]): Promise<number[][]> {
    return embedTextChunksImpl(this.#embeddingModel, texts);
  }

  processLogicalMemory(
    params: LibrarianProcessLogicalMemoryParams,
  ): Promise<ProcessLogicalMemoryResult<TNode, TEdge>> {
    return processLogicalMemoryWithLibrarian({
      ...params,
      client: this.client,
      embeddingModel: this.#embeddingModel,
      multimodal: this.multimodal,
    });
  }
}
