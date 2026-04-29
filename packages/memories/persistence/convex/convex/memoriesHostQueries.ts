import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { query } from "./_generated/server.js";

const vNeighborNodesFilter = v.object({
  all: v.optional(v.array(v.string())),
  some: v.optional(v.array(v.string())),
});

const vNeighborConstraint = v.object({
  label: v.string(),
  direction: v.optional(v.union(v.literal("in"), v.literal("out"))),
  nodes: v.optional(vNeighborNodesFilter),
});

const vNeighborFilter = v.object({
  all: v.optional(v.array(vNeighborConstraint)),
  some: v.optional(v.array(vNeighborConstraint)),
});

const cq = components.memories.queries;

/** Host forwards for browser {@link ConvexReactClient}; same validators as the memories component queries. */
export const findMemoryIdByKey = query({
  args: { namespace: v.string(), key: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.findMemoryIdByKey, args),
});

export const listMemoriesInNamespace = query({
  args: { namespace: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.listMemoriesInNamespace, args),
});

export const getLexicalTextForMemorySource = query({
  args: { memoryId: v.string(), sourceKey: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.getLexicalTextForMemorySource, args),
});

export const nodeExists = query({
  args: { nodeId: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.nodeExists, args),
});

export const listNeighborMemoryKeysForNodeQuery = query({
  args: { namespace: v.string(), nodeId: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.listNeighborMemoryKeysForNodeQuery, args),
});

export const buildCanonicalMemorySearchMetaTextQuery = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.buildCanonicalMemorySearchMetaTextQuery, args),
});

export const searchLexicalSourceMapIds = query({
  args: {
    scope: v.object({
      kind: v.union(v.literal("union"), v.literal("unscoped")),
      namespaces: v.optional(v.array(v.string())),
    }),
    text: v.string(),
    limit: v.number(),
    memoryIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => ctx.runQuery(cq.searchLexicalSourceMapIds, args),
});

export const hydrateSourceMapHits = query({
  args: { sourceMapIds: v.array(v.string()) },
  handler: async (ctx, args) => ctx.runQuery(cq.hydrateSourceMapHits, args),
});

export const listNeighborsForMemory = query({
  args: {
    namespace: v.string(),
    key: v.string(),
    filters: v.optional(vNeighborFilter),
  },
  handler: async (ctx, args) => ctx.runQuery(cq.listNeighborsForMemory, args),
});

export const loadGraphEdgesForNamespace = query({
  args: { namespace: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.loadGraphEdgesForNamespace, args),
});

export const listIncidentGraphEdges = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.listIncidentGraphEdges, args),
});

export const loadGraphEdge = query({
  args: { namespace: v.string(), edgeId: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.loadGraphEdge, args),
});

export const loadNodeLabelsForMemory = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.loadNodeLabelsForMemory, args),
});

export const loadNodePropertiesForMemory = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.loadNodePropertiesForMemory, args),
});

export const loadGraphNode = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.loadGraphNode, args),
});

export const loadNodeLabelsForNamespace = query({
  args: { namespace: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.loadNodeLabelsForNamespace, args),
});

export const loadNodePropertiesForNamespace = query({
  args: { namespace: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.loadNodePropertiesForNamespace, args),
});

export const listSourceMapsForMemory = query({
  args: { memoryId: v.string(), limit: v.number() },
  handler: async (ctx, args) => ctx.runQuery(cq.listSourceMapsForMemory, args),
});

export const listTextFeatureExportRowsForMemory = query({
  args: { memoryId: v.string() },
  handler: async (ctx, args) => ctx.runQuery(cq.listTextFeatureExportRowsForMemory, args),
});

export const listVectorEmbeddingIndexDimensions = query({
  args: {},
  handler: async (ctx, args) => ctx.runQuery(cq.listVectorEmbeddingIndexDimensions, args),
});
