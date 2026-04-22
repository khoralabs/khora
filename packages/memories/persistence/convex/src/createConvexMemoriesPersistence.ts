import type {
  GraphEdgeLink,
  GraphNode,
  HydratedNeighbor,
  HydratedSourceMapHit,
  MemoriesPersistenceAsync,
  MemoryOpContext,
  NeighborFilter,
  OntologyLabelInstance,
  SearchNamespaceScope,
} from "@cfd/memories-core";
import type { SourceMap, TextFeatureExportRow } from "@cfd/memories-core/persistence";
import type { FunctionReference } from "convex/server";
import { api } from "./component/_generated/api.js";
import type { ComponentApi } from "./component/_generated/component.js";

const CAPABILITIES = {
  lexicalSearch: true,
  vectorSearch: true,
  neighborIndex: false,
  graphIndex: false,
  multiNamespaceSearch: true,
  unscopedSearch: false,
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

    async deleteMemoryRootRows(memoryId: string, nodeId: string): Promise<void> {
      await client.mutation(m.deleteMemoryRootRows, { memoryId, nodeId });
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
      });
    },

    async hydrateSourceMapHits(sourceMapIds: readonly string[]): Promise<HydratedSourceMapHit[]> {
      return client.query(q.hydrateSourceMapHits, { sourceMapIds: [...sourceMapIds] });
    },

    async listNeighborsForMemory<
      EDGE_LABEL extends string = string,
      NODE_LABEL extends string = string,
    >(input: {
      namespace: string;
      key: string;
      filters?: NeighborFilter<EDGE_LABEL, NODE_LABEL>;
    }): Promise<HydratedNeighbor[]> {
      return client.query(q.listNeighborsForMemory, {
        namespace: input.namespace,
        key: input.key,
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

    async loadGraphEdgesForNamespace(_namespace: string): Promise<GraphEdgeLink[]> {
      return [];
    },

    async loadNodeLabelsForNamespace(
      _namespace: string,
    ): Promise<Map<string, OntologyLabelInstance[]>> {
      return new Map();
    },

    async loadNodePropertiesForNamespace(
      _namespace: string,
    ): Promise<Map<string, Record<string, unknown> | null>> {
      return new Map();
    },

    async listIncidentGraphEdges(_namespace: string, _memoryKey: string): Promise<GraphEdgeLink[]> {
      return [];
    },

    async loadNodeLabelsForMemory(
      _namespace: string,
      _memoryKey: string,
    ): Promise<OntologyLabelInstance[]> {
      return [];
    },

    async loadNodePropertiesForMemory(
      _namespace: string,
      _memoryKey: string,
    ): Promise<Record<string, unknown> | null> {
      return null;
    },

    async loadGraphEdge(_namespace: string, _edgeId: string): Promise<GraphEdgeLink | null> {
      return null;
    },

    async loadGraphNode(_namespace: string, _memoryKey: string): Promise<GraphNode | null> {
      return null;
    },
  };
}
