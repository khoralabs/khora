import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { syncLabelPropsSearchFeaturesImpl } from "./lib/labelPropsSearch.js";
import { runMergeMemoryAtomic } from "./lib/mergeAtomicRunner.js";
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
import {
  appendProvenanceEventImpl,
  updateSourceMapContentHashImpl,
} from "./lib/provenanceConvex.js";

export const clearMemorySubtree = mutation({
  args: v.object({
    memoryKind: v.union(v.literal("node"), v.literal("edge")),
    memoryId: v.string(),
    nodeId: v.optional(v.string()),
    edgeId: v.optional(v.string()),
  }),
  returns: v.null(),
  handler: async (ctx, input) => {
    if (input.memoryKind === "node") {
      if (!input.nodeId) {
        throw new Error("clearMemorySubtree: nodeId required when memoryKind is node");
      }
      await clearMemorySubtreeImpl(ctx, {
        memoryKind: "node",
        memoryId: input.memoryId,
        nodeId: input.nodeId,
      });
      return null;
    }
    if (!input.edgeId) {
      throw new Error("clearMemorySubtree: edgeId required when memoryKind is edge");
    }
    await clearMemorySubtreeImpl(ctx, {
      memoryKind: "edge",
      memoryId: input.memoryId,
      edgeId: input.edgeId,
    });
    return null;
  },
});

export const upsertMemory = mutation({
  args: {
    namespace: v.string(),
    key: v.string(),
    now: v.number(),
    kind: v.optional(v.union(v.literal("node"), v.literal("edge"))),
    edgeId: v.optional(v.union(v.string(), v.null())),
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

export const updateSourceMapContentHash = mutation({
  args: {
    sourceMapId: v.string(),
    contentHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateSourceMapContentHashImpl(ctx, args);
    return null;
  },
});

export const appendProvenanceEvent = mutation({
  args: {
    now: v.number(),
    event: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await appendProvenanceEventImpl(ctx, {
      now: args.now,
      event: args.event as import("@cfd/memories-core/provenance").MemoryProvenanceEvent,
    });
    return null;
  },
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
      metaVector: args.metaVector !== undefined ? [...args.metaVector] : undefined,
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

const vMergeEdgePayload = v.object({
  from_key: v.string(),
  to_key: v.string(),
  label: v.object({
    kind: v.string(),
    props: v.record(v.string(), v.any()),
  }),
  properties: v.optional(v.record(v.string(), v.any())),
});

export const mergeMemoryAtomic = mutation({
  args: v.object({
    kind: v.optional(v.union(v.literal("node"), v.literal("edge"))),
    namespace: v.string(),
    key: v.string(),
    content: v.array(vMergeContentItem),
    labels: v.optional(v.array(vMergeLabel)),
    properties: v.optional(v.record(v.string(), v.any())),
    edges: v.optional(v.array(vMergeEdge)),
    edge: v.optional(vMergeEdgePayload),
    searchMetaVector: v.optional(v.array(v.float64())),
    now: v.number(),
  }),
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    if ((args.kind ?? "node") === "edge") {
      if (!args.edge) {
        throw new Error("mergeMemoryAtomic: edge payload required when kind is edge");
      }
      return runMergeMemoryAtomic(ctx, {
        kind: "edge",
        namespace: args.namespace,
        key: args.key,
        content: args.content.map((c) => ({
          key: c.key,
          text: c.text,
          vector: c.vector !== undefined ? [...c.vector] : undefined,
        })),
        edge: {
          from_key: args.edge.from_key,
          to_key: args.edge.to_key,
          label: {
            kind: args.edge.label.kind,
            props: args.edge.label.props as Record<string, unknown>,
          },
          properties: args.edge.properties,
        },
        searchMetaVector:
          args.searchMetaVector !== undefined ? [...args.searchMetaVector] : undefined,
        now: args.now,
      });
    }
    return runMergeMemoryAtomic(ctx, {
      namespace: args.namespace,
      key: args.key,
      content: args.content.map((c) => ({
        key: c.key,
        text: c.text,
        vector: c.vector !== undefined ? [...c.vector] : undefined,
      })),
      labels: (args.labels ?? []).map((l) => ({
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
        args.searchMetaVector !== undefined ? [...args.searchMetaVector] : undefined,
      now: args.now,
    });
  },
});

export const deleteMemoryRootRows = mutation({
  args: v.object({
    memoryKind: v.union(v.literal("node"), v.literal("edge")),
    memoryId: v.optional(v.string()),
    nodeId: v.optional(v.string()),
    edgeId: v.optional(v.string()),
  }),
  returns: v.null(),
  handler: async (ctx, input) => {
    if (input.memoryKind === "node") {
      if (!input.memoryId || !input.nodeId) {
        throw new Error(
          "deleteMemoryRootRows: memoryId and nodeId required when memoryKind is node",
        );
      }
      const { memoryId, nodeId } = input;
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
    }
    if (!input.edgeId) {
      throw new Error("deleteMemoryRootRows: edgeId required when memoryKind is edge");
    }
    const edgeId = input.edgeId;
    const linked = await ctx.db
      .query("memories")
      .withIndex("by_edgeId", (q) => q.eq("edgeId", edgeId))
      .collect();
    for (const m of linked) {
      if (m._id !== undefined) await ctx.db.delete(m._id);
    }
    const e = await ctx.db
      .query("edges")
      .withIndex("by_edgeId", (q) => q.eq("edgeId", edgeId))
      .unique();
    if (e?._id !== undefined) await ctx.db.delete(e._id);
    return null;
  },
});
