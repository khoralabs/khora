import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { mutation } from "./_generated/server.js";

const cm = components.memories.mutations;

/** Host forwards for browser {@link ConvexReactClient}. */
export const clearMemorySubtree = mutation({
  args: {
    memoryId: v.string(),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.clearMemorySubtree, args),
});

export const upsertMemory = mutation({
  args: {
    namespace: v.string(),
    key: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.upsertMemory, args),
});

export const upsertNodeForMemoryKey = mutation({
  args: {
    namespace: v.string(),
    memoryKey: v.string(),
    properties: v.optional(v.record(v.string(), v.any())),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.upsertNodeForMemoryKey, args),
});

export const insertSourceMap = mutation({
  args: {
    memoryId: v.string(),
    sourceKey: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.insertSourceMap, args),
});

export const insertLexicalFeature = mutation({
  args: {
    memoryId: v.string(),
    sourceMapId: v.string(),
    text: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.insertLexicalFeature, args),
});

export const insertVectorFeature = mutation({
  args: {
    memoryId: v.string(),
    sourceMapId: v.string(),
    vector: v.array(v.float64()),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.insertVectorFeature, args),
});

export const ensureNodeLabel = mutation({
  args: {
    kind: v.string(),
    description: v.optional(v.string()),
    schemaJson: v.optional(v.union(v.string(), v.null())),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.ensureNodeLabel, args),
});

export const insertNodeLabelAssignment = mutation({
  args: {
    nodeId: v.string(),
    labelId: v.string(),
    props: v.record(v.string(), v.any()),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.insertNodeLabelAssignment, args),
});

export const insertEdge = mutation({
  args: {
    fromNodeId: v.string(),
    toNodeId: v.string(),
    properties: v.optional(v.record(v.string(), v.any())),
    idParts: v.object({
      selfMemoryKey: v.string(),
      otherMemoryKey: v.string(),
      label: v.string(),
    }),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.insertEdge, args),
});

export const ensureEdgeLabel = mutation({
  args: {
    kind: v.string(),
    description: v.optional(v.string()),
    schemaJson: v.optional(v.union(v.string(), v.null())),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.ensureEdgeLabel, args),
});

export const insertEdgeLabelAssignment = mutation({
  args: {
    edgeId: v.string(),
    labelId: v.string(),
    props: v.record(v.string(), v.any()),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.insertEdgeLabelAssignment, args),
});

export const syncMemorySearchMeta = mutation({
  args: {
    namespace: v.string(),
    memoryKey: v.string(),
    now: v.number(),
    metaVector: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.syncMemorySearchMeta, args),
});

export const upsertMemorySearchMetaVector = mutation({
  args: {
    namespace: v.string(),
    memoryKey: v.string(),
    vector: v.array(v.float64()),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.upsertMemorySearchMetaVector, args),
});

export const syncLabelPropsSearchFeatures = mutation({
  args: {
    namespace: v.string(),
    memoryKey: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.syncLabelPropsSearchFeatures, args),
});

const vMergeEdge = v.object({
  memory_key: v.string(),
  direction: v.union(v.literal("in"), v.literal("out")),
  label: v.object({
    kind: v.string(),
    props: v.record(v.string(), v.any()),
  }),
  properties: v.optional(v.record(v.string(), v.any())),
});

const vMergeContentItem = v.object({
  key: v.string(),
  text: v.optional(v.string()),
  vector: v.optional(v.array(v.float64())),
});

const vMergeLabel = v.object({
  kind: v.string(),
  props: v.record(v.string(), v.any()),
});

export const mergeMemoryAtomic = mutation({
  args: {
    namespace: v.string(),
    key: v.string(),
    content: v.array(vMergeContentItem),
    labels: v.array(vMergeLabel),
    properties: v.optional(v.record(v.string(), v.any())),
    edges: v.optional(v.array(vMergeEdge)),
    searchMetaVector: v.optional(v.array(v.float64())),
    now: v.number(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.mergeMemoryAtomic, args),
});

export const deleteMemoryRootRows = mutation({
  args: {
    memoryId: v.string(),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => ctx.runMutation(cm.deleteMemoryRootRows, args),
});
