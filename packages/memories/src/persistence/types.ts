import type {
  HydratedNeighbor,
  HydratedSourceMapHit,
  NeighborFilter,
} from "../models/neighbor-search-types";

/** Timestamp context for writes and validators that use `_ts_created`. */
export type MemoryOpContext = { now: number };

/** Graph edge summary (storage-agnostic shape). */
export type GraphEdgeLink = {
  edgeId: string;
  fromKey: string;
  toKey: string;
  labels: string[];
};

/** Mean-pooled embedding per memory for layout (storage-agnostic shape). */
export type GraphMemoryEmbedding = {
  memoryKey: string;
  memoryId: string;
  embedding: number[];
};

export type EdgePreviewPayload = {
  edgeId: string;
  fromKey: string;
  toKey: string;
  labels: string[];
  properties: Record<string, unknown> | null;
};

/**
 * Core storage for memories: merge/search/delete, content chunks, graph-backed retrieval for search,
 * and search-meta. Does not include layout or UI preview reads—see {@link MemoriesVisualizationPersistence}.
 */
export interface MemoriesPersistence {
  withTransaction<T>(fn: () => T): T;

  listNeighborMemoryKeysForNode(op: MemoryOpContext, namespace: string, nodeId: string): string[];

  clearMemorySubtree(op: MemoryOpContext, memoryId: string, nodeId: string): void;

  upsertMemory(
    op: MemoryOpContext,
    input: { namespace: string; key: string },
  ): { memoryId: string; _ts_created: number };

  upsertNodeForMemoryKey(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string; properties?: Record<string, unknown> },
  ): { nodeId: string };

  insertSourceMap(
    op: MemoryOpContext,
    input: { memoryId: string; sourceKey: string },
  ): { sourceMapId: string };

  insertTextFeatureWithFts(
    op: MemoryOpContext,
    input: { memoryId: string; sourceMapId: string; text: string },
  ): { textFeatureId: string };

  insertVectorFeatureWithVecIndex(
    op: MemoryOpContext,
    input: { memoryId: string; sourceMapId: string; vector: Float32Array },
  ): { vectorFeatureId: string };

  ensureNodeLabel(op: MemoryOpContext, value: string): string;

  insertNodeLabelAssignment(op: MemoryOpContext, input: { nodeId: string; labelId: string }): void;

  findMemoryIdByKey(namespace: string, key: string): string | undefined;

  nodeExists(nodeId: string): boolean;

  insertEdge(
    op: MemoryOpContext,
    input: {
      fromNodeId: string;
      toNodeId: string;
      properties?: Record<string, unknown>;
      idParts: { selfMemoryKey: string; otherMemoryKey: string; label: string };
    },
  ): { edgeId: string };

  ensureEdgeLabel(op: MemoryOpContext, value: string): string;

  insertEdgeLabelAssignment(op: MemoryOpContext, input: { edgeId: string; labelId: string }): void;

  syncMemorySearchMeta(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string; metaVector?: Float32Array },
  ): void;

  buildCanonicalMemorySearchMetaText(
    op: MemoryOpContext,
    namespace: string,
    memoryKey: string,
  ): string;

  upsertMemorySearchMetaVector(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string; vector: Float32Array },
  ): void;

  deleteMemoryRootRows(memoryId: string, nodeId: string): void;

  searchLexicalSourceMapIds(input: {
    namespace: string;
    text: string;
    limit: number;
    memoryIds?: string[];
  }): string[];

  searchVectorSourceMapIds(input: {
    namespace: string;
    vector: number[];
    limit: number;
    memoryIds?: string[];
  }): string[];

  hydrateSourceMapHits<NODE_LABEL extends string = string>(
    sourceMapIds: readonly string[],
  ): HydratedSourceMapHit<NODE_LABEL>[];

  listNeighborsForMemory<
    EDGE_LABEL extends string = string,
    NODE_LABEL extends string = string,
  >(input: {
    namespace: string;
    key: string;
    filters?: NeighborFilter<EDGE_LABEL, NODE_LABEL>;
  }): HydratedNeighbor<EDGE_LABEL, NODE_LABEL>[];
}

/**
 * Read model for visualization / graph UI: edge lists, layout inputs, and text previews.
 * Distinct from {@link MemoriesPersistence}; a store may expose both via separate adapters.
 */
export interface MemoriesVisualizationPersistence {
  loadGraphEdgesForNamespace(namespace: string): GraphEdgeLink[];

  loadNodeLabelsForNamespace(namespace: string): Map<string, string[]>;

  loadMeanEmbeddingsForNamespace(namespace: string): GraphMemoryEmbedding[];

  loadMemoryTextPreview(namespace: string, key: string, maxChars?: number): string | null;

  loadEdgePreview(namespace: string, edgeId: string): EdgePreviewPayload | null;
}

/** Core persistence passed to merge / search / delete APIs. */
export type MemoriesRuntimeCtx = { persistence: MemoriesPersistence };

/** Persistence that supports graph layout and preview routes. */
export type MemoriesVisualizationRuntimeCtx = {
  persistence: MemoriesVisualizationPersistence;
};
