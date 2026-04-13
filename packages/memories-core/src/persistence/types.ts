import type { SourceMap, TextFeatureExportRow } from "../db/rows.js";
import type {
  HydratedNeighbor,
  HydratedSourceMapHit,
  NeighborFilter,
} from "../models/neighbor-search-types";
import type { OntologyLabelInstance } from "../models/ontology-label";

/** Timestamp context for writes and validators that use `_ts_created`. */
export type MemoryOpContext = { now: number };

/** Graph edge summary (storage-agnostic shape). */
export type GraphEdgeLink = {
  edgeId: string;
  fromKey: string;
  toKey: string;
  labels: OntologyLabelInstance[];
  /**
   * When true, visualization keeps `fromKey` → `toKey` (e.g. dash flow, no undirected merge).
   * Set when the stored edge is directed (e.g. merge-created links).
   */
  directed?: boolean;
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
  labels: OntologyLabelInstance[];
  properties: Record<string, unknown> | null;
};

/**
 * Features the backend exposes for hybrid search and graph expansion.
 * Omitted keys default via {@link resolveMemoriesBackendCapabilities} (see {@link DEFAULT_MEMORIES_BACKEND_CAPABILITIES}).
 */
export type MemoriesBackendCapabilities = {
  lexicalSearch: boolean;
  vectorSearch: boolean;
  neighborIndex: boolean;
  /** When `true`, retrieval can filter `namespace IN (...)` in one call. When `false`, core merges per-namespace results (RRF). */
  multiNamespaceSearch: boolean;
  /** When `true`, retrieval can run without a namespace predicate (entire DB). Required for `searchEntireDatabase` on `SearchParams`. */
  unscopedSearch: boolean;
};

/** Namespace filter for {@link MemoriesRetrieval} hybrid search; caller normalizes unions (non-empty, deduped). */
export type SearchNamespaceScope =
  | { kind: "union"; namespaces: readonly string[] }
  | { kind: "unscoped" };

/** Default when {@link MemoriesPersistence.capabilities} is omitted (full-featured backend). */
export const DEFAULT_MEMORIES_BACKEND_CAPABILITIES: MemoriesBackendCapabilities = {
  lexicalSearch: true,
  vectorSearch: true,
  neighborIndex: true,
  multiNamespaceSearch: true,
  unscopedSearch: false,
};

/** Resolve effective capabilities for merge/search logic. */
export function resolveMemoriesBackendCapabilities(persistence: {
  capabilities?: Partial<MemoriesBackendCapabilities>;
}): MemoriesBackendCapabilities {
  return { ...DEFAULT_MEMORIES_BACKEND_CAPABILITIES, ...persistence.capabilities };
}

/**
 * Transactional writes, merge/delete graph, search-meta.
 */
export interface MemoriesMutation {
  /**
   * Run `fn` inside a single transaction; commit on return, rollback on throw.
   * **Note:** Prefer one outer transaction per merge/delete; nesting depends on the driver.
   */
  withTransaction<T>(fn: () => T): T;

  /**
   * Memory keys for memories connected by edges to the given node (used when syncing search-meta for neighbors).
   * **Post:** Returns deduped logical keys in namespace for merge side-effects.
   */
  listNeighborMemoryKeysForNode(op: MemoryOpContext, namespace: string, nodeId: string): string[];

  /**
   * Delete all dependent rows for this memory subtree (features, maps, edges, labels, meta, etc.).
   * **Pre:** Typically called at start of merge after resolving `memoryId` / `nodeId`.
   */
  clearMemorySubtree(op: MemoryOpContext, memoryId: string, nodeId: string): void;

  /** Upsert root memory row; returns stable ids and creation timestamp field used by validators. */
  upsertMemory(
    op: MemoryOpContext,
    input: { namespace: string; key: string },
  ): { memoryId: string; _ts_created: number };

  /** Upsert the primary graph node for a memory key; optional JSON properties on the node. */
  upsertNodeForMemoryKey(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string; properties?: Record<string, unknown> },
  ): { nodeId: string };

  /** Insert a source map row for (memoryId, sourceKey); content items are one map each. */
  insertSourceMap(
    op: MemoryOpContext,
    input: { memoryId: string; sourceKey: string },
  ): { sourceMapId: string };

  /** Attach searchable text for lexical retrieval on a source map. */
  insertLexicalFeature(
    op: MemoryOpContext,
    input: { memoryId: string; sourceMapId: string; text: string },
  ): { textFeatureId: string };

  /** Attach a vector feature and index it for vector search (dimension must match query embeddings). */
  insertVectorFeature(
    op: MemoryOpContext,
    input: { memoryId: string; sourceMapId: string; vector: Float32Array },
  ): { vectorFeatureId: string };

  /** Get or create a catalog row for a node label **kind**; optional JSON Schema text for assignment props. */
  ensureNodeLabel(
    op: MemoryOpContext,
    input: { kind: string; description?: string; schemaJson?: string | null },
  ): string;

  /** Assign props for one node label kind (upserts the single row per node + kind). */
  insertNodeLabelAssignment(
    op: MemoryOpContext,
    input: { nodeId: string; labelId: string; props: Record<string, unknown> },
  ): void;

  /** Resolve memory primary key by logical key, or `undefined` if absent. */
  findMemoryIdByKey(namespace: string, key: string): string | undefined;

  /** Whether a node row exists (used to validate edge targets). */
  nodeExists(nodeId: string): boolean;

  /** Insert a directed edge between two nodes; `idParts` encode deduplication identity. */
  insertEdge(
    op: MemoryOpContext,
    input: {
      fromNodeId: string;
      toNodeId: string;
      properties?: Record<string, unknown>;
      idParts: { selfMemoryKey: string; otherMemoryKey: string; label: string };
    },
  ): { edgeId: string };

  ensureEdgeLabel(
    op: MemoryOpContext,
    input: { kind: string; description?: string; schemaJson?: string | null },
  ): string;

  insertEdgeLabelAssignment(
    op: MemoryOpContext,
    input: { edgeId: string; labelId: string; props: Record<string, unknown> },
  ): void;

  /**
   * Rebuild search-meta canonical text (and optional vector) for a memory key.
   * **Post:** Meta chunk participates in hybrid search when lexical/vector features exist.
   */
  syncMemorySearchMeta(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string; metaVector?: Float32Array },
  ): void;

  /**
   * Rebuild lexical label-property chunks for ontology props (node assignments + incident edges).
   * Optional: backends that only support topology meta may omit; the reference persistence implements this.
   */
  syncLabelPropsSearchFeatures?(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string },
  ): void;

  /** Build canonical meta text for a memory (read during sync). */
  buildCanonicalMemorySearchMetaText(
    op: MemoryOpContext,
    namespace: string,
    memoryKey: string,
  ): string;

  /** Upsert vector for the search-meta source map only (batch path after merge). */
  upsertMemorySearchMetaVector(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string; vector: Float32Array },
  ): void;

  /** Delete root memory and graph node records after subtree clear (delete flow). */
  deleteMemoryRootRows(memoryId: string, nodeId: string): void;
}

/**
 * Lexical + vector retrieval and hydration for hybrid search.
 * Return lists are **rank-ordered** `source_map` ids (best first); scores are not supplied—RRF uses rank.
 */
export interface MemoriesRetrieval {
  searchLexicalSourceMapIds(input: {
    scope: SearchNamespaceScope;
    text: string;
    limit: number;
    memoryIds?: string[];
  }): string[];

  searchVectorSourceMapIds(input: {
    scope: SearchNamespaceScope;
    vector: number[];
    limit: number;
    memoryIds?: string[];
  }): string[];

  hydrateSourceMapHits(sourceMapIds: readonly string[]): HydratedSourceMapHit[];
}

/** Graph neighbor listing for search expansion and filters. */
export interface MemoriesNeighborIndex {
  listNeighborsForMemory<
    EDGE_LABEL extends string = string,
    NODE_LABEL extends string = string,
  >(input: {
    namespace: string;
    key: string;
    filters?: NeighborFilter<EDGE_LABEL, NODE_LABEL>;
  }): HydratedNeighbor[];
}

/**
 * Prefetch / export reads (aligned with Smithy persistence ops).
 * {@link listVectorEmbeddingIndexDimensions} returns `[]` when the store cannot infer dimensions (unknown or not applicable).
 */
export interface MemoriesPersistenceReads {
  /** Source map rows for a memory, newest first, capped at `limit`. */
  listSourceMapsForMemory(memoryId: string, limit: number): SourceMap[];

  /** Text lines joined with source keys for JSONL sync and similar export paths. */
  listTextFeatureExportRowsForMemory(memoryId: string): TextFeatureExportRow[];

  /**
   * Distinct embedding widths present in the store's vector indexes (one entry per width in use).
   * Return `[]` when there are no indexed vectors or dimension metadata is unavailable.
   */
  listVectorEmbeddingIndexDimensions(): number[];
}

/**
 * Core storage: {@link MemoriesMutation} + {@link MemoriesRetrieval} + {@link MemoriesNeighborIndex} + {@link MemoriesPersistenceReads}.
 * Optional {@link MemoriesBackendCapabilities} declares MVP subsets.
 * Visualization reads: {@link MemoriesVisualization}.
 */
export type MemoriesPersistence = MemoriesMutation &
  MemoriesRetrieval &
  MemoriesNeighborIndex &
  MemoriesPersistenceReads & {
    capabilities?: MemoriesBackendCapabilities;
  };

/**
 * Read model for visualization / graph UI: edge lists, layout inputs, and text previews.
 * Distinct from {@link MemoriesPersistence}; a store may expose both via separate adapters.
 */
export interface MemoriesVisualization {
  loadGraphEdgesForNamespace(namespace: string): GraphEdgeLink[];

  loadNodeLabelsForNamespace(namespace: string): Map<string, OntologyLabelInstance[]>;

  /** Node JSON properties from stored graph nodes (null when absent or empty). */
  loadNodePropertiesForNamespace(namespace: string): Map<string, Record<string, unknown> | null>;

  loadMeanEmbeddingsForNamespace(namespace: string): GraphMemoryEmbedding[];

  loadMemoryTextPreview(namespace: string, key: string, maxChars?: number): string | null;

  loadEdgePreview(namespace: string, edgeId: string): EdgePreviewPayload | null;
}

/** Core persistence passed to merge / search / delete APIs. */
export type MemoriesRuntimeCtx = { persistence: MemoriesPersistence };

/** Persistence that supports graph layout and preview routes. */
export type MemoriesVisualizationRuntimeCtx = {
  persistence: MemoriesVisualization;
};
