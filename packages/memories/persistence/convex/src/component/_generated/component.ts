/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> = {
  actions: {
    searchVectorSourceMapIds: FunctionReference<
      "action",
      "internal",
      {
        limit: number;
        maxVectorDistance?: number;
        memoryIds?: Array<string>;
        scope: { kind: "union" | "unscoped"; namespaces?: Array<string> };
        vector: Array<number>;
      },
      Array<string>,
      Name
    >;
  };
  mutations: {
    appendProvenanceEvent: FunctionReference<
      "mutation",
      "internal",
      { event: any; now: number },
      null,
      Name
    >;
    clearMemorySubtree: FunctionReference<
      "mutation",
      "internal",
      { memoryId: string; nodeId: string },
      null,
      Name
    >;
    deleteMemoryRootRows: FunctionReference<
      "mutation",
      "internal",
      { memoryId: string; nodeId: string },
      null,
      Name
    >;
    ensureEdgeLabel: FunctionReference<
      "mutation",
      "internal",
      {
        description?: string;
        kind: string;
        now: number;
        schemaJson?: string | null;
      },
      string,
      Name
    >;
    ensureNodeLabel: FunctionReference<
      "mutation",
      "internal",
      {
        description?: string;
        kind: string;
        now: number;
        schemaJson?: string | null;
      },
      string,
      Name
    >;
    insertEdge: FunctionReference<
      "mutation",
      "internal",
      {
        fromNodeId: string;
        idParts: {
          label: string;
          otherMemoryKey: string;
          selfMemoryKey: string;
        };
        now: number;
        properties?: Record<string, any>;
        toNodeId: string;
      },
      { edgeId: string },
      Name
    >;
    insertEdgeLabelAssignment: FunctionReference<
      "mutation",
      "internal",
      {
        edgeId: string;
        labelId: string;
        now: number;
        props: Record<string, any>;
      },
      null,
      Name
    >;
    insertLexicalFeature: FunctionReference<
      "mutation",
      "internal",
      { memoryId: string; now: number; sourceMapId: string; text: string },
      { textFeatureId: string },
      Name
    >;
    insertNodeLabelAssignment: FunctionReference<
      "mutation",
      "internal",
      {
        labelId: string;
        nodeId: string;
        now: number;
        props: Record<string, any>;
      },
      null,
      Name
    >;
    insertSourceMap: FunctionReference<
      "mutation",
      "internal",
      { memoryId: string; now: number; sourceKey: string },
      { sourceMapId: string },
      Name
    >;
    insertVectorFeature: FunctionReference<
      "mutation",
      "internal",
      {
        memoryId: string;
        now: number;
        sourceMapId: string;
        vector: Array<number>;
      },
      { vectorFeatureId: string },
      Name
    >;
    mergeMemoryAtomic: FunctionReference<
      "mutation",
      "internal",
      {
        content: Array<{
          key: string;
          text?: string;
          vector?: Array<number>;
        }>;
        edges?: Array<{
          direction: "in" | "out";
          label: { kind: string; props: Record<string, any> };
          memory_key: string;
          properties?: Record<string, any>;
        }>;
        key: string;
        labels: Array<{ kind: string; props: Record<string, any> }>;
        namespace: string;
        now: number;
        properties?: Record<string, any>;
        searchMetaVector?: Array<number>;
      },
      Array<string>,
      Name
    >;
    syncLabelPropsSearchFeatures: FunctionReference<
      "mutation",
      "internal",
      { memoryKey: string; namespace: string; now: number },
      null,
      Name
    >;
    syncMemorySearchMeta: FunctionReference<
      "mutation",
      "internal",
      {
        memoryKey: string;
        metaVector?: Array<number>;
        namespace: string;
        now: number;
      },
      null,
      Name
    >;
    updateSourceMapContentHash: FunctionReference<
      "mutation",
      "internal",
      { contentHash: string; sourceMapId: string },
      null,
      Name
    >;
    upsertMemory: FunctionReference<
      "mutation",
      "internal",
      { key: string; namespace: string; now: number },
      { _ts_created: number; memoryId: string },
      Name
    >;
    upsertMemorySearchMetaVector: FunctionReference<
      "mutation",
      "internal",
      {
        memoryKey: string;
        namespace: string;
        now: number;
        vector: Array<number>;
      },
      null,
      Name
    >;
    upsertNodeForMemoryKey: FunctionReference<
      "mutation",
      "internal",
      {
        memoryKey: string;
        namespace: string;
        now: number;
        properties?: Record<string, any>;
      },
      { nodeId: string },
      Name
    >;
  };
  queries: {
    buildCanonicalMemorySearchMetaTextQuery: FunctionReference<
      "query",
      "internal",
      { memoryKey: string; namespace: string },
      string,
      Name
    >;
    findMemoryIdByKey: FunctionReference<
      "query",
      "internal",
      { key: string; namespace: string },
      string | null,
      Name
    >;
    getLexicalTextForMemorySource: FunctionReference<
      "query",
      "internal",
      { memoryId: string; sourceKey: string },
      string | null,
      Name
    >;
    getProvenanceHeadRootHex: FunctionReference<"query", "internal", {}, string | null, Name>;
    hydrateSourceMapHits: FunctionReference<
      "query",
      "internal",
      { sourceMapIds: Array<string> },
      Array<{
        _id: string;
        _ts_created: number;
        labels: Array<{ kind: string; props: Record<string, any> }>;
        memory: {
          _id: string;
          _ts_created: number;
          key: string;
          namespace: string;
        };
        memory_id: string;
        source_key: string;
      }>,
      Name
    >;
    listIncidentGraphEdges: FunctionReference<
      "query",
      "internal",
      { memoryKey: string; namespace: string },
      Array<{
        directed?: boolean;
        edgeId: string;
        fromKey: string;
        labels: Array<{ kind: string; props: Record<string, any> }>;
        properties?: Record<string, any> | null;
        toKey: string;
      }>,
      Name
    >;
    listMemoriesInNamespace: FunctionReference<
      "query",
      "internal",
      { namespace: string },
      Array<{
        bodyText: string | null;
        key: string;
        memoryId: string;
        tsCreated: number;
      }>,
      Name
    >;
    listNeighborMemoryKeysForNodeQuery: FunctionReference<
      "query",
      "internal",
      { namespace: string; nodeId: string },
      Array<string>,
      Name
    >;
    listNeighborsForMemory: FunctionReference<
      "query",
      "internal",
      {
        filters?: {
          all?: Array<{
            direction?: "in" | "out";
            label: string;
            nodes?: { all?: Array<string>; some?: Array<string> };
          }>;
          some?: Array<{
            direction?: "in" | "out";
            label: string;
            nodes?: { all?: Array<string>; some?: Array<string> };
          }>;
        };
        key: string;
        namespace: string;
      },
      Array<{
        _id: string;
        _ts_created: number;
        edge: {
          _id: string;
          _ts_created: number;
          from_node_id: string;
          label: { kind: string; props: Record<string, any> };
          properties?: Record<string, any>;
          to_node_id: string;
        };
        key: string;
        labels: Array<{ kind: string; props: Record<string, any> }>;
        namespace: string;
      }>,
      Name
    >;
    listSourceMapsForMemory: FunctionReference<
      "query",
      "internal",
      { limit: number; memoryId: string },
      Array<{
        _id: string;
        _ts_created: number;
        content_hash?: string;
        memory_id: string;
        source_key: string;
      }>,
      Name
    >;
    listTextFeatureExportRowsForMemory: FunctionReference<
      "query",
      "internal",
      { memoryId: string },
      Array<{ memory_id: string; source_key: string; text: string }>,
      Name
    >;
    listVectorEmbeddingIndexDimensions: FunctionReference<
      "query",
      "internal",
      {},
      Array<number>,
      Name
    >;
    loadGraphEdge: FunctionReference<
      "query",
      "internal",
      { edgeId: string; namespace: string },
      {
        directed?: boolean;
        edgeId: string;
        fromKey: string;
        labels: Array<{ kind: string; props: Record<string, any> }>;
        properties?: Record<string, any> | null;
        toKey: string;
      } | null,
      Name
    >;
    loadGraphEdgesForNamespace: FunctionReference<
      "query",
      "internal",
      { namespace: string },
      Array<{
        directed?: boolean;
        edgeId: string;
        fromKey: string;
        labels: Array<{ kind: string; props: Record<string, any> }>;
        properties?: Record<string, any> | null;
        toKey: string;
      }>,
      Name
    >;
    loadGraphNode: FunctionReference<
      "query",
      "internal",
      { memoryKey: string; namespace: string },
      {
        labels: Array<{ kind: string; props: Record<string, any> }>;
        memoryKey: string;
        namespace: string;
        nodeId: string;
        properties: Record<string, any> | null;
      } | null,
      Name
    >;
    loadNodeLabelsForMemory: FunctionReference<
      "query",
      "internal",
      { memoryKey: string; namespace: string },
      Array<{ kind: string; props: Record<string, any> }>,
      Name
    >;
    loadNodeLabelsForNamespace: FunctionReference<
      "query",
      "internal",
      { namespace: string },
      Array<{
        labels: Array<{ kind: string; props: Record<string, any> }>;
        memoryKey: string;
      }>,
      Name
    >;
    loadNodePropertiesForMemory: FunctionReference<
      "query",
      "internal",
      { memoryKey: string; namespace: string },
      Record<string, any> | null,
      Name
    >;
    loadNodePropertiesForNamespace: FunctionReference<
      "query",
      "internal",
      { namespace: string },
      Array<{ memoryKey: string; properties: Record<string, any> | null }>,
      Name
    >;
    nodeExists: FunctionReference<"query", "internal", { nodeId: string }, boolean, Name>;
    searchLexicalSourceMapIds: FunctionReference<
      "query",
      "internal",
      {
        limit: number;
        memoryIds?: Array<string>;
        scope: { kind: "union" | "unscoped"; namespaces?: Array<string> };
        text: string;
      },
      Array<string>,
      Name
    >;
  };
};
