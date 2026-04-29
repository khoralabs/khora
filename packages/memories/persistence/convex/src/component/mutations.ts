import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { syncLabelPropsSearchFeaturesImpl } from "./lib/labelPropsSearch.js";
import {
  clearMemorySubtreeImpl,
  ensureEdgeLabelImpl,
  ensureNodeLabelImpl,
  insertEdgeImpl,
  insertEdgeLabelAssignmentImpl,
  insertLexicalFeatureImpl,
  insertNodeLabelAssignmentImpl,
  insertSourceMapImpl,
  insertVectorFeatureImpl,
  syncMemorySearchMetaImpl,
  upsertMemoryImpl,
  upsertMemorySearchMetaVectorImpl,
  upsertNodeForMemoryKeyImpl,
} from "./lib/mergeWrites.js";
import { runMergeMemoryAtomic } from "./lib/mergeAtomicRunner.js";

export const clearMemorySubtree = mutation({
  args: {
    memoryId: v.string(),
    nodeId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { memoryId, nodeId }) => {
    await clearMemorySubtreeImpl(ctx, memoryId, nodeId);
    return null;
  },
});

export const upsertMemory = mutation({
  args: {
    namespace: v.string(),
    key: v.string(),
    now: v.number(),
  },
  returns: v.object({
    memoryId: v.string(),
    _ts_created: v.number(),
  }),
  handler: async (ctx, args) => upsertMemoryImpl(ctx, args),
});

export const upsertNodeForMemoryKey = mutation({
  args: {
    namespace: v.string(),
    memoryKey: v.string(),
    properties: v.optional(v.record(v.string(), v.any())),
    now: v.number(),
  },
  returns: v.object({ nodeId: v.string() }),
  handler: async (ctx, args) => upsertNodeForMemoryKeyImpl(ctx, args),
});

export const insertSourceMap = mutation({
  args: {
    memoryId: v.string(),
    sourceKey: v.string(),
    now: v.number(),
  },
  returns: v.object({ sourceMapId: v.string() }),
  handler: async (ctx, args) => insertSourceMapImpl(ctx, args),
});

export const insertLexicalFeature = mutation({
  args: {
    memoryId: v.string(),
    sourceMapId: v.string(),
    text: v.string(),
    now: v.number(),
  },
  returns: v.object({ textFeatureId: v.string() }),
  handler: async (ctx, args) => insertLexicalFeatureImpl(ctx, args),
});

export const insertVectorFeature = mutation({
  args: {
    memoryId: v.string(),
    sourceMapId: v.string(),
    vector: v.array(v.float64()),
    now: v.number(),
  },
  returns: v.object({ vectorFeatureId: v.string() }),
  handler: async (ctx, args) =>
    insertVectorFeatureImpl(ctx, {
      ...args,
      vector: [...args.vector],
    }),
});

export const ensureNodeLabel = mutation({
  args: {
    kind: v.string(),
    description: v.optional(v.string()),
    schemaJson: v.optional(v.union(v.string(), v.null())),
    now: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => ensureNodeLabelImpl(ctx, args),
});

export const insertNodeLabelAssignment = mutation({
  args: {
    nodeId: v.string(),
    labelId: v.string(),
    props: v.record(v.string(), v.any()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await insertNodeLabelAssignmentImpl(ctx, args);
    return null;
  },
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
  returns: v.object({
    edgeId: v.string(),
  }),
  handler: async (ctx, args) => insertEdgeImpl(ctx, args),
});

export const ensureEdgeLabel = mutation({
  args: {
    kind: v.string(),
    description: v.optional(v.string()),
    schemaJson: v.optional(v.union(v.string(), v.null())),
    now: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => ensureEdgeLabelImpl(ctx, args),
});

export const insertEdgeLabelAssignment = mutation({
  args: {
    edgeId: v.string(),
    labelId: v.string(),
    props: v.record(v.string(), v.any()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await insertEdgeLabelAssignmentImpl(ctx, args);
    return null;
  },
});

export const syncMemorySearchMeta = mutation({
  args: {
    namespace: v.string(),
    memoryKey: v.string(),
    now: v.number(),
    metaVector: v.optional(v.array(v.float64())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await syncMemorySearchMetaImpl(ctx, {
      ...args,
      metaVector:
        args.metaVector !== undefined ? [...args.metaVector] : undefined,
    });
    return null;
  },
});

export const upsertMemorySearchMetaVector = mutation({
  args: {
    namespace: v.string(),
    memoryKey: v.string(),
    vector: v.array(v.float64()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertMemorySearchMetaVectorImpl(ctx, {
      ...args,
      vector: [...args.vector],
    });
    return null;
  },
});

export const syncLabelPropsSearchFeatures = mutation({
  args: {
    namespace: v.string(),
    memoryKey: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await syncLabelPropsSearchFeaturesImpl(ctx, args);
    return null;
  },
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
  returns: v.array(v.string()),
  handler: async (ctx, args) =>
    runMergeMemoryAtomic(ctx, {
      namespace: args.namespace,
      key: args.key,
      content: args.content.map((c) => ({
        key: c.key,
        text: c.text,
        vector: c.vector !== undefined ? [...c.vector] : undefined,
      })),
      labels: args.labels.map((l) => ({
        kind: l.kind,
        props: l.props as Record<string, unknown>,
      })),
      properties: args.properties,
      edges: args.edges?.map((e) => ({
        memory_key: e.memory_key,
        direction: e.direction,
        label: {
          kind: e.label.kind,
          props: e.label.props as Record<string, unknown>,
        },
        properties: e.properties,
      })),
      searchMetaVector:
        args.searchMetaVector !== undefined
          ? [...args.searchMetaVector]
          : undefined,
      now: args.now,
    }),
});

export const deleteMemoryRootRows = mutation({
  args: {
    memoryId: v.string(),
    nodeId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { memoryId, nodeId }) => {
    const m = await ctx.db
      .query("memories")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .unique();
    if (m) await ctx.db.delete(m._id);
    const n = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", nodeId))
      .unique();
    if (n) await ctx.db.delete(n._id);
    return null;
  },
});
