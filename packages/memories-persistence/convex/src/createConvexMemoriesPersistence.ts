import type {
  HydratedNeighbor,
  HydratedSourceMapHit,
  MemoriesPersistenceAsync,
  MemoryOpContext,
  NeighborFilter,
  SearchNamespaceScope,
} from "@cfd/memories-core";
import type { SourceMap, TextFeatureExportRow } from "@cfd/memories-core/persistence";
import type { FunctionReference } from "convex/server";
import { api } from "./_generated/api.js";

const CAPABILITIES = {
  lexicalSearch: true,
  vectorSearch: false,
  neighborIndex: false,
  multiNamespaceSearch: true,
  unscopedSearch: false,
} as const;

type QueryClient = {
  query: <Args extends Record<string, unknown>, Ret>(
    ref: FunctionReference<"query", "public", Args, Ret>,
    args: Args,
  ) => Promise<Ret>;
};

type MutationClient = {
  mutation: <Args extends Record<string, unknown>, Ret>(
    ref: FunctionReference<"mutation", "public", Args, Ret>,
    args: Args,
  ) => Promise<Ret>;
};

export type ConvexMemoriesClient = QueryClient & MutationClient;

/**
 * Async persistence backed by the Convex functions in this package (`src/mutations`, `src/queries`).
 * Uses {@link api} from `./_generated/api`. `withTransaction` runs the callback only (sequential RPCs); see README for atomicity vs SQLite.
 */
export function createConvexMemoriesPersistence(client: ConvexMemoriesClient): MemoriesPersistenceAsync {
  const m = api.mutations;
  const q = api.queries;

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
      return client.query(q.findMemoryIdByKey, { namespace, key });
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
      return client.query(q.searchVectorSourceMapIds, {
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
      }) as Promise<HydratedNeighbor[]>;
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
  };
}
