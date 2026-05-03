import type {
  GraphEdgeLink,
  GraphNode,
  HydratedNeighbor,
  HydratedSourceMapHit,
  MemoriesPersistenceAsync,
  MemoryOpContext,
  NamespacePath,
  NeighborFilter,
  OntologyLabelInstance,
  SearchNamespaceScope,
} from "@cfd/memories-core";
import type { SourceMap, TextFeatureExportRow } from "@cfd/memories-core/persistence";
import type { MemoryProvenanceEvent } from "@cfd/memories-core/provenance";
import { computeSourceMapContentHash } from "@cfd/memories-core/provenance";
import type { FunctionReference } from "convex/server";
import { api } from "./component/_generated/api.js";
import type { ComponentApi } from "./component/_generated/component.js";

const CAPABILITIES = {
  lexicalSearch: true,
  vectorSearch: true,
  neighborIndex: true,
  graphIndex: true,
  multiNamespaceSearch: true,
  unscopedSearch: true,
} as const;

type QueryClient = {
  query: <Args extends Record<string, unknown>, Ret>(
    ref: FunctionReference<"query", "public" | "internal", Args, Ret>,
    args: Args,
  ) => Promise<Ret>;
};

type MutationClient = {
  mutation: <Args extends Record<string, unknown>, Ret>(
    ref: FunctionReference<"mutation", "public" | "internal", Args, Ret>,
    args: Args,
  ) => Promise<Ret>;
};

type ActionClient = {
  action: <Args extends Record<string, unknown>, Ret>(
    ref: FunctionReference<"action", "public" | "internal", Args, Ret>,
    args: Args,
  ) => Promise<Ret>;
};

export type ConvexMemoriesClient = QueryClient & MutationClient & ActionClient;

/** Function references for this component’s `mutations` / `queries` / `actions` modules (matches {@link api} or `components.<name>` from a host app). */
export type MemoriesConvexApiSlice = Pick<ComponentApi, "mutations" | "queries" | "actions">;

/**
 * Async persistence backed by the Convex functions in this package (`src/component/mutations`, `src/component/queries`).
 * Pass `components.memories` (or another mounted instance) as `refs` from a host that wraps this component.
 * Default `refs` uses the package’s {@link api}. `withTransaction` runs the callback only (sequential RPCs); see README for atomicity vs SQLite.
 *
 * **Vector embeddings:** Supported widths are exactly those re-exported as `CONVEX_VECTOR_DIMENSIONS` from this package.
 * `listVectorEmbeddingIndexDimensions` returns that fixed set (not dimensions inferred from stored vectors, unlike SQLite).
 * Portable code should validate embedding length against `CONVEX_VECTOR_DIMENSIONS` when targeting Convex.
 */
export function createConvexMemoriesPersistence(
  client: ConvexMemoriesClient,
  refs: MemoriesConvexApiSlice = {
    mutations: api.mutations,
    queries: api.queries,
    actions: api.actions,
  } as unknown as MemoriesConvexApiSlice,
): MemoriesPersistenceAsync {
  const m = refs.mutations;
  const q = refs.queries;
  const a = refs.actions;

  return {
    capabilities: CAPABILITIES,

    async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    },

    async listNeighborMemoryKeysForNode(
      _op: MemoryOpContext,
      namespace: string,
      nodeId: string,
    ): Promise<string[]> {
      return client.query(q.listNeighborMemoryKeysForNodeQuery, { namespace, nodeId });
    },

    async clearMemorySubtree(
      _op: MemoryOpContext,
      memoryId: string,
      nodeId: string,
    ): Promise<void> {
      await client.mutation(m.clearMemorySubtree, { memoryId, nodeId });
    },

    async upsertMemory(
      op: MemoryOpContext,
      input: { namespace: string; key: string },
    ): Promise<{ memoryId: string; _ts_created: number }> {
      return client.mutation(m.upsertMemory, {
        namespace: input.namespace,
        key: input.key,
        now: op.now,
      });
    },

    async upsertNodeForMemoryKey(
      op: MemoryOpContext,
      input: { namespace: string; memoryKey: string; properties?: Record<string, unknown> },
    ): Promise<{ nodeId: string }> {
      return client.mutation(m.upsertNodeForMemoryKey, {
        namespace: input.namespace,
        memoryKey: input.memoryKey,
        properties: input.properties,
        now: op.now,
      });
    },

    async insertSourceMap(
      op: MemoryOpContext,
      input: { memoryId: string; sourceKey: string },
    ): Promise<{ sourceMapId: string }> {
      return client.mutation(m.insertSourceMap, {
        memoryId: input.memoryId,
        sourceKey: input.sourceKey,
        now: op.now,
      });
    },

    async insertLexicalFeature(
      op: MemoryOpContext,
      input: { memoryId: string; sourceMapId: string; text: string },
    ): Promise<{ textFeatureId: string }> {
      return client.mutation(m.insertLexicalFeature, {
        memoryId: input.memoryId,
        sourceMapId: input.sourceMapId,
        text: input.text,
        now: op.now,
      });
    },

    insertVectorFeature(
      op: MemoryOpContext,
      input: { memoryId: string; sourceMapId: string; vector: Float32Array },
    ): Promise<{ vectorFeatureId: string }> {
      return client.mutation(m.insertVectorFeature, {
        memoryId: input.memoryId,
        sourceMapId: input.sourceMapId,
        vector: Array.from(input.vector),
        now: op.now,
      }) as Promise<{ vectorFeatureId: string }>;
    },

    async ensureNodeLabel(
      op: MemoryOpContext,
      input: { kind: string; description?: string; schemaJson?: string | null },
    ): Promise<string> {
      return client.mutation(m.ensureNodeLabel, {
        kind: input.kind,
        description: input.description,
        schemaJson: input.schemaJson,
        now: op.now,
      });
    },

    async insertNodeLabelAssignment(
      op: MemoryOpContext,
      input: { nodeId: string; labelId: string; props: Record<string, unknown> },
    ): Promise<void> {
      await client.mutation(m.insertNodeLabelAssignment, {
        nodeId: input.nodeId,
        labelId: input.labelId,
        props: input.props,
        now: op.now,
      });
    },

    async findMemoryIdByKey(namespace: string, key: string): Promise<string | undefined> {
      const id = await client.query(q.findMemoryIdByKey, { namespace, key });
      return id ?? undefined;
    },

    async nodeExists(nodeId: string): Promise<boolean> {
      return client.query(q.nodeExists, { nodeId });
    },

    async insertEdge(
      op: MemoryOpContext,
      input: {
        fromNodeId: string;
        toNodeId: string;
        properties?: Record<string, unknown>;
        idParts: { selfMemoryKey: string; otherMemoryKey: string; label: string };
      },
    ): Promise<{ edgeId: string }> {
      return client.mutation(m.insertEdge, {
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        properties: input.properties,
        idParts: input.idParts,
        now: op.now,
      });
    },

    async ensureEdgeLabel(
      op: MemoryOpContext,
      input: { kind: string; description?: string; schemaJson?: string | null },
    ): Promise<string> {
      return client.mutation(m.ensureEdgeLabel, {
        kind: input.kind,
        description: input.description,
        schemaJson: input.schemaJson,
        now: op.now,
      });
    },

    async insertEdgeLabelAssignment(
      op: MemoryOpContext,
      input: { edgeId: string; labelId: string; props: Record<string, unknown> },
    ): Promise<void> {
      await client.mutation(m.insertEdgeLabelAssignment, {
        edgeId: input.edgeId,
        labelId: input.labelId,
        props: input.props,
        now: op.now,
      });
    },

    async syncMemorySearchMeta(
      op: MemoryOpContext,
      input: { namespace: string; memoryKey: string; metaVector?: Float32Array },
    ): Promise<void> {
      await client.mutation(m.syncMemorySearchMeta, {
        namespace: input.namespace,
        memoryKey: input.memoryKey,
        now: op.now,
        ...(input.metaVector !== undefined && input.metaVector.length > 0
          ? { metaVector: Array.from(input.metaVector) }
          : {}),
      });
    },

    async buildCanonicalMemorySearchMetaText(
      _op: MemoryOpContext,
      namespace: string,
      memoryKey: string,
    ): Promise<string> {
      return client.query(q.buildCanonicalMemorySearchMetaTextQuery, { namespace, memoryKey });
    },

    async upsertMemorySearchMetaVector(
      op: MemoryOpContext,
      input: { namespace: string; memoryKey: string; vector: Float32Array },
    ): Promise<void> {
      await client.mutation(m.upsertMemorySearchMetaVector, {
        namespace: input.namespace,
        memoryKey: input.memoryKey,
        vector: Array.from(input.vector),
        now: op.now,
      });
    },

    async syncLabelPropsSearchFeatures(
      op: MemoryOpContext,
      input: { namespace: string; memoryKey: string },
    ): Promise<void> {
      await client.mutation(m.syncLabelPropsSearchFeatures, {
        namespace: input.namespace,
        memoryKey: input.memoryKey,
        now: op.now,
      });
    },

    async deleteMemoryRootRows(memoryId: string, nodeId: string): Promise<void> {
      await client.mutation(m.deleteMemoryRootRows, { memoryId, nodeId });
    },

    async getProvenanceHeadRootHex(): Promise<string | undefined> {
      const h = await client.query(q.getProvenanceHeadRootHex, {});
      return h ?? undefined;
    },

    async appendProvenanceEvent(op: MemoryOpContext, event: MemoryProvenanceEvent): Promise<void> {
      await client.mutation(m.appendProvenanceEvent, { now: op.now, event });
    },

    async updateSourceMapContentHash(
      op: MemoryOpContext,
      input: { sourceMapId: string; text?: string; vector?: Float32Array },
    ): Promise<void> {
      const hash = computeSourceMapContentHash({
        text: input.text,
        vector: input.vector,
      });
      await client.mutation(m.updateSourceMapContentHash, {
        sourceMapId: input.sourceMapId,
        contentHash: hash,
      });
    },

    async searchLexicalSourceMapIds(input: {
      scope: SearchNamespaceScope;
      text: string;
      limit: number;
      memoryIds?: string[];
    }): Promise<string[]> {
      const scope =
        input.scope.kind === "unscoped"
          ? { kind: "unscoped" as const }
          : { kind: "union" as const, namespaces: [...input.scope.namespaces] };
      return client.query(q.searchLexicalSourceMapIds, {
        scope,
        text: input.text,
        limit: input.limit,
        memoryIds: input.memoryIds,
      });
    },

    async searchVectorSourceMapIds(input: {
      scope: SearchNamespaceScope;
      vector: number[];
      limit: number;
      memoryIds?: string[];
      maxVectorDistance?: number;
    }): Promise<string[]> {
      const scope =
        input.scope.kind === "unscoped"
          ? { kind: "unscoped" as const }
          : { kind: "union" as const, namespaces: [...input.scope.namespaces] };
      return client.action(a.searchVectorSourceMapIds, {
        scope,
        vector: input.vector,
        limit: input.limit,
        memoryIds: input.memoryIds,
        ...(input.maxVectorDistance !== undefined
          ? { maxVectorDistance: input.maxVectorDistance }
          : {}),
      });
    },

    async hydrateSourceMapHits(sourceMapIds: readonly string[]): Promise<HydratedSourceMapHit[]> {
      return client.query(q.hydrateSourceMapHits, { sourceMapIds: [...sourceMapIds] });
    },

    async listNeighborsForMemory<
      EDGE_LABEL extends string = string,
      NODE_LABEL extends string = string,
    >(input: {
      namespace: NamespacePath;
      key: string;
      filters?: NeighborFilter<EDGE_LABEL, NODE_LABEL>;
    }): Promise<HydratedNeighbor[]> {
      return client.query(q.listNeighborsForMemory, {
        namespace: input.namespace,
        key: input.key,
        ...(input.filters !== undefined ? { filters: input.filters } : {}),
      }) as unknown as Promise<HydratedNeighbor[]>;
    },

    async listSourceMapsForMemory(memoryId: string, limit: number): Promise<SourceMap[]> {
      return client.query(q.listSourceMapsForMemory, { memoryId, limit });
    },

    async listTextFeatureExportRowsForMemory(memoryId: string): Promise<TextFeatureExportRow[]> {
      return client.query(q.listTextFeatureExportRowsForMemory, { memoryId });
    },

    async listVectorEmbeddingIndexDimensions(): Promise<number[]> {
      return client.query(q.listVectorEmbeddingIndexDimensions, {});
    },

    async loadGraphEdgesForNamespace(namespace: string): Promise<GraphEdgeLink[]> {
      return client.query(q.loadGraphEdgesForNamespace, { namespace });
    },

    async loadNodeLabelsForNamespace(
      namespace: string,
    ): Promise<Map<string, OntologyLabelInstance[]>> {
      const rows = await client.query(q.loadNodeLabelsForNamespace, { namespace });
      return new Map(rows.map((r) => [r.memoryKey, r.labels]));
    },

    async loadNodePropertiesForNamespace(
      namespace: string,
    ): Promise<Map<string, Record<string, unknown> | null>> {
      const rows = await client.query(q.loadNodePropertiesForNamespace, { namespace });
      return new Map(rows.map((r) => [r.memoryKey, r.properties]));
    },

    async listIncidentGraphEdges(namespace: string, memoryKey: string): Promise<GraphEdgeLink[]> {
      return client.query(q.listIncidentGraphEdges, { namespace, memoryKey });
    },

    async loadNodeLabelsForMemory(
      namespace: string,
      memoryKey: string,
    ): Promise<OntologyLabelInstance[]> {
      return client.query(q.loadNodeLabelsForMemory, { namespace, memoryKey });
    },

    async loadNodePropertiesForMemory(
      namespace: string,
      memoryKey: string,
    ): Promise<Record<string, unknown> | null> {
      return client.query(q.loadNodePropertiesForMemory, { namespace, memoryKey });
    },

    async loadGraphEdge(namespace: string, edgeId: string): Promise<GraphEdgeLink | null> {
      return client.query(q.loadGraphEdge, { namespace, edgeId });
    },

    async loadGraphNode(namespace: string, memoryKey: string): Promise<GraphNode | null> {
      return client.query(q.loadGraphNode, { namespace, memoryKey });
    },
  };
}
