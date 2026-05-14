import type { LabelSchemaMap, MemoriesClient } from "@khoralabs/memories-core";
import type {
  EmbeddingModel,
  HybridMemorySearchClient,
  HybridMemorySearchInput,
  MemorySearchHit,
} from "@khoralabs/memories-core/helpers";
import { runHybridMemorySearch } from "@khoralabs/memories-core/helpers";
import type {
  AtriumMemoriesSearchNamespaces,
  AtriumMemoriesSearchScope,
} from "@khoralabs/atrium-contracts";
import { resolveAtriumMemoriesSearchNamespaces } from "@khoralabs/atrium-contracts";

export type AtriumMemoriesHybridSearchArgs = HybridMemorySearchInput & {
  scope: AtriumMemoriesSearchScope;
  embeddingCache?: Map<string, number[]>;
  memoriesSnapshotRootHex?: string;
  embeddingModel?: EmbeddingModel;
};

/** Arguments for raw-namespace hybrid search (no scope discrimination). */
export type AtriumMemoriesRawHybridArgs = HybridMemorySearchInput & {
  namespace: string;
  additionalNamespaces?: readonly string[];
  embeddingCache?: Map<string, number[]>;
  memoriesSnapshotRootHex?: string;
  embeddingModel?: EmbeddingModel;
};

/**
 * Hybrid Memories search with a discriminated {@link AtriumMemoriesSearchScope}.
 */
export function atriumMemoriesHybridSearch<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TEntityMap extends Record<string, unknown>,
>(
  memories: MemoriesClient<TNode, TEdge, TEntityMap>,
  params: {
    memoryNamespaces: AtriumMemoriesSearchNamespaces | undefined;
    defaultEmbeddingModel?: EmbeddingModel;
  },
  args: AtriumMemoriesHybridSearchArgs,
): Promise<MemorySearchHit[]> {
  const {
    scope,
    embeddingCache,
    memoriesSnapshotRootHex,
    embeddingModel: modelArg,
    content,
    options,
    searchScopeMode,
  } = args;
  const embeddingModel = modelArg ?? params.defaultEmbeddingModel;
  const { namespace, additionalNamespaces } = resolveAtriumMemoriesSearchNamespaces(
    scope,
    params.memoryNamespaces,
  );
  return runHybridMemorySearch(
    memories as unknown as HybridMemorySearchClient,
    {
      namespace,
      additionalNamespaces,
      embeddingModel,
      embeddingCache,
      memoriesSnapshotRootHex,
    },
    { content, options, ...(searchScopeMode !== undefined ? { searchScopeMode } : {}) },
  );
}

/**
 * Hybrid lexical + vector search with explicit namespace paths (escape hatch).
 */
export function atriumMemoriesHybridSearchRaw<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
  TEntityMap extends Record<string, unknown>,
>(
  memories: MemoriesClient<TNode, TEdge, TEntityMap>,
  params: { defaultEmbeddingModel?: EmbeddingModel },
  args: AtriumMemoriesRawHybridArgs,
): Promise<MemorySearchHit[]> {
  const {
    namespace,
    additionalNamespaces,
    embeddingCache,
    memoriesSnapshotRootHex,
    embeddingModel: modelArg,
    content,
    options,
    searchScopeMode,
  } = args;
  const embeddingModel = modelArg ?? params.defaultEmbeddingModel;
  return runHybridMemorySearch(
    memories as unknown as HybridMemorySearchClient,
    {
      namespace,
      additionalNamespaces,
      embeddingModel,
      embeddingCache,
      memoriesSnapshotRootHex,
    },
    { content, options, ...(searchScopeMode !== undefined ? { searchScopeMode } : {}) },
  );
}
