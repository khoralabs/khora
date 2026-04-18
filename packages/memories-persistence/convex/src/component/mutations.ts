import { ids, namespacePath, namespacePrefixFields } from "@cfd/memories-core";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server.js";
import { mutation } from "./_generated/server.js";
import {
  buildCanonicalMemorySearchMetaText,
  MEMORY_SEARCH_META_SOURCE_KEY,
} from "./lib/helpers.js";
import {
  CONVEX_VECTOR_DIMENSIONS,
  type ConvexVectorDimension,
  isConvexVectorDimension,
  vectorTableNameForDim,
} from "./lib/vectorConfig.js";

async function deleteVectorFeaturesBySourceMapId(
  ctx: MutationCtx,
  sourceMapId: string,
): Promise<void> {
  for (const dim of CONVEX_VECTOR_DIMENSIONS) {
    const table = vectorTableNameForDim(dim);
    const row = await ctx.db
      .query(table)
      .withIndex("by_sourceMapId", (q) => q.eq("sourceMapId", sourceMapId))
      .unique();
    if (row?._id !== undefined) await ctx.db.delete(row._id);
  }
}

async function removeMemorySearchMeta(ctx: MutationCtx, memoryId: string): Promise<void> {
  const sourceMapId = ids.sourceMap(memoryId, MEMORY_SEARCH_META_SOURCE_KEY);
  const sm = await ctx.db
    .query("source_maps")
    .withIndex("by_sourceMapId", (q) => q.eq("sourceMapId", sourceMapId))
    .unique();
  if (!sm) return;
  const tfs = await ctx.db
    .query("text_features")
    .withIndex("by_sourceMapId", (q) => q.eq("sourceMapId", sourceMapId))
    .collect();
  for (const tf of tfs) {
    if (tf._id !== undefined) await ctx.db.delete(tf._id);
  }
  await deleteVectorFeaturesBySourceMapId(ctx, sourceMapId);
  if (sm._id !== undefined) await ctx.db.delete(sm._id);
}

export const clearMemorySubtree = mutation({
  args: {
    memoryId: v.string(),
    nodeId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { memoryId, nodeId }) => {
    const tfs = await ctx.db
      .query("text_features")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .collect();
    for (const r of tfs) await ctx.db.delete(r._id);

    for (const dim of CONVEX_VECTOR_DIMENSIONS) {
      const table = vectorTableNameForDim(dim);
      const vfs = await ctx.db
        .query(table)
        .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
        .collect();
      for (const r of vfs) await ctx.db.delete(r._id);
    }

    const sms = await ctx.db
      .query("source_maps")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .collect();
    for (const r of sms) await ctx.db.delete(r._id);

    const from = await ctx.db
      .query("edges")
      .withIndex("by_from", (q) => q.eq("fromNodeId", nodeId))
      .collect();
    const to = await ctx.db
      .query("edges")
      .withIndex("by_to", (q) => q.eq("toNodeId", nodeId))
      .collect();
    const seen = new Set<string>();
    for (const e of [...from, ...to]) {
      if (seen.has(e.edgeId)) continue;
      seen.add(e.edgeId);
      const assigns = await ctx.db
        .query("edge_label_assignments")
        .withIndex("by_edge_label", (q) => q.eq("edgeId", e.edgeId))
        .collect();
      for (const a of assigns) await ctx.db.delete(a._id);
      await ctx.db.delete(e._id);
    }

    const nlas = await ctx.db
      .query("node_label_assignments")
      .withIndex("by_node_label", (q) => q.eq("nodeId", nodeId))
      .collect();
    for (const r of nlas) await ctx.db.delete(r._id);
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
  handler: async (ctx, { namespace, key, now }) => {
    const memoryId = ids.memory(namespace, key);
    const existing = await ctx.db
      .query("memories")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .unique();
    const tsCreated = existing?.tsCreated ?? now;
    if (existing) {
      await ctx.db.patch(existing._id, { namespace, key, tsCreated });
    } else {
      await ctx.db.insert("memories", {
        memoryId,
        namespace,
        key,
        tsCreated: now,
      });
    }
    return { memoryId, _ts_created: tsCreated };
  },
});

export const upsertNodeForMemoryKey = mutation({
  args: {
    namespace: v.string(),
    memoryKey: v.string(),
    properties: v.optional(v.record(v.string(), v.any())),
    now: v.number(),
  },
  returns: v.object({ nodeId: v.string() }),
  handler: async (ctx, { namespace, memoryKey, properties, now }) => {
    const nodeId = ids.node(namespace, memoryKey);
    const memoryId = ids.memory(namespace, memoryKey);
    const existing = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", nodeId))
      .unique();
    const propsJson = properties === undefined ? undefined : JSON.stringify(properties ?? {});
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: memoryKey,
        propertiesJson: propsJson,
        memoryId,
        namespace,
      });
    } else {
      await ctx.db.insert("nodes", {
        nodeId,
        memoryId,
        namespace,
        value: memoryKey,
        propertiesJson: propsJson,
        tsCreated: now,
      });
    }
    return { nodeId };
  },
});

export const insertSourceMap = mutation({
  args: {
    memoryId: v.string(),
    sourceKey: v.string(),
    now: v.number(),
  },
  returns: v.object({ sourceMapId: v.string() }),
  handler: async (ctx, { memoryId, sourceKey, now }) => {
    const mem = await ctx.db
      .query("memories")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .unique();
    if (!mem) throw new Error("insertSourceMap: memory not found");
    const sourceMapId = ids.sourceMap(memoryId, sourceKey);
    await ctx.db.insert("source_maps", {
      sourceMapId,
      memoryId,
      namespace: mem.namespace,
      source_key: sourceKey,
      tsCreated: now,
    });
    return { sourceMapId };
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
  handler: async (ctx, { memoryId, sourceMapId, text, now }) => {
    const mem = await ctx.db
      .query("memories")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .unique();
    if (!mem) throw new Error("insertLexicalFeature: memory not found");
    const textFeatureId = ids.textFeature(sourceMapId);
    const ns = namespacePath(mem.namespace);
    await ctx.db.insert("text_features", {
      textFeatureId,
      memoryId,
      namespace: mem.namespace,
      ...namespacePrefixFields(ns),
      sourceMapId,
      text,
      tsCreated: now,
    });
    return { textFeatureId };
  },
});

export const insertVectorFeature = mutation({
  args: {
    memoryId: v.string(),
    sourceMapId: v.string(),
    vector: v.array(v.float64()),
    now: v.number(),
  },
  returns: v.object({ vectorFeatureId: v.string() }),
  handler: async (ctx, { memoryId, sourceMapId, vector, now }) => {
    const dim = vector.length;
    if (!isConvexVectorDimension(dim)) {
      throw new Error(`insertVectorFeature: unsupported embedding dimension ${dim}`);
    }
    const mem = await ctx.db
      .query("memories")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .unique();
    if (!mem) throw new Error("insertVectorFeature: memory not found");
    const vectorFeatureId = ids.vectorFeature(sourceMapId);
    const ns = namespacePath(mem.namespace);
    const table = vectorTableNameForDim(dim);
    await ctx.db.insert(table, {
      vectorFeatureId,
      memoryId,
      namespace: mem.namespace,
      ...namespacePrefixFields(ns),
      sourceMapId,
      vector,
      tsCreated: now,
    });
    return { vectorFeatureId };
  },
});

export const ensureNodeLabel = mutation({
  args: {
    kind: v.string(),
    description: v.optional(v.string()),
    schemaJson: v.optional(v.union(v.string(), v.null())),
    now: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, { kind, description, schemaJson, now }) => {
    const existing = (
      await ctx.db
        .query("node_labels")
        .withIndex("by_kind", (q) => q.eq("kind", kind))
        .take(1)
    )[0];
    const desc = description ?? "";
    const schema = schemaJson === undefined || schemaJson === "" ? null : schemaJson;
    if (existing) {
      if (schema != null && schema !== existing.schemaJson) {
        await ctx.db.patch(existing._id, {
          description: desc,
          schemaJson: schema,
        });
      }
      return existing.labelId;
    }
    const labelId = ids.nodeLabel(kind);
    await ctx.db.insert("node_labels", {
      labelId,
      kind,
      description: desc,
      schemaJson: schema,
      tsCreated: now,
    });
    return labelId;
  },
});

export const insertNodeLabelAssignment = mutation({
  args: {
    nodeId: v.string(),
    labelId: v.string(),
    props: v.record(v.string(), v.any()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { nodeId, labelId, props, now }) => {
    const propsJson = JSON.stringify(props ?? {});
    const existing = await ctx.db
      .query("node_label_assignments")
      .withIndex("by_node_label", (q) => q.eq("nodeId", nodeId))
      .filter((q) => q.eq(q.field("labelId"), labelId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { propsJson, tsCreated: now });
    } else {
      const assignmentId = ids.nodeLabelAssignment(nodeId, labelId);
      await ctx.db.insert("node_label_assignments", {
        assignmentId,
        nodeId,
        labelId,
        propsJson,
        tsCreated: now,
      });
    }
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
  handler: async (
    ctx,
    { fromNodeId, toNodeId, properties, idParts, now },
  ): Promise<{ edgeId: string }> => {
    const fromNode = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", fromNodeId))
      .unique();
    if (!fromNode) throw new Error("insertEdge: from node not found");
    const edgeId = ids.edge(
      fromNodeId,
      toNodeId,
      idParts.label,
      idParts.selfMemoryKey,
      idParts.otherMemoryKey,
    );
    const propertiesJson = properties === undefined ? undefined : JSON.stringify(properties ?? {});
    await ctx.db.insert("edges", {
      edgeId,
      fromNodeId,
      toNodeId,
      namespace: fromNode.namespace,
      propertiesJson,
      idPartsSelfKey: idParts.selfMemoryKey,
      idPartsOtherKey: idParts.otherMemoryKey,
      idPartsLabel: idParts.label,
      tsCreated: now,
    });
    return { edgeId };
  },
});

export const ensureEdgeLabel = mutation({
  args: {
    kind: v.string(),
    description: v.optional(v.string()),
    schemaJson: v.optional(v.union(v.string(), v.null())),
    now: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, { kind, description, schemaJson, now }) => {
    const existing = (
      await ctx.db
        .query("edge_labels")
        .withIndex("by_kind", (q) => q.eq("kind", kind))
        .take(1)
    )[0];
    const desc = description ?? "";
    const schema = schemaJson === undefined || schemaJson === "" ? null : schemaJson;
    if (existing) {
      if (schema != null && schema !== existing.schemaJson) {
        await ctx.db.patch(existing._id, {
          description: desc,
          schemaJson: schema,
        });
      }
      return existing.labelId;
    }
    const labelId = ids.edgeLabel(kind);
    await ctx.db.insert("edge_labels", {
      labelId,
      kind,
      description: desc,
      schemaJson: schema,
      tsCreated: now,
    });
    return labelId;
  },
});

export const insertEdgeLabelAssignment = mutation({
  args: {
    edgeId: v.string(),
    labelId: v.string(),
    props: v.record(v.string(), v.any()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { edgeId, labelId, props, now }) => {
    const propsJson = JSON.stringify(props ?? {});
    const existing = await ctx.db
      .query("edge_label_assignments")
      .withIndex("by_edge_label", (q) => q.eq("edgeId", edgeId))
      .filter((q) => q.eq(q.field("labelId"), labelId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { propsJson, tsCreated: now });
    } else {
      const assignmentId = ids.edgeLabelAssignment(edgeId, labelId);
      await ctx.db.insert("edge_label_assignments", {
        assignmentId,
        edgeId,
        labelId,
        propsJson,
        tsCreated: now,
      });
    }
    return null;
  },
});

export const syncMemorySearchMeta = mutation({
  args: {
    namespace: v.string(),
    memoryKey: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { namespace, memoryKey, now }) => {
    const memoryId = ids.memory(namespace, memoryKey);
    const text = await buildCanonicalMemorySearchMetaText(ctx, namespace, memoryKey);
    await removeMemorySearchMeta(ctx, memoryId);
    if (text.length === 0) return null;
    const mem = await ctx.db
      .query("memories")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .unique();
    if (!mem) throw new Error("syncMemorySearchMeta: memory not found");
    const sourceMapId = ids.sourceMap(memoryId, MEMORY_SEARCH_META_SOURCE_KEY);
    await ctx.db.insert("source_maps", {
      sourceMapId,
      memoryId,
      namespace: mem.namespace,
      source_key: MEMORY_SEARCH_META_SOURCE_KEY,
      tsCreated: now,
    });
    const textFeatureId = ids.textFeature(sourceMapId);
    const ns = namespacePath(mem.namespace);
    await ctx.db.insert("text_features", {
      textFeatureId,
      memoryId,
      namespace: mem.namespace,
      ...namespacePrefixFields(ns),
      sourceMapId,
      text,
      tsCreated: now,
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
  handler: async (ctx, { namespace, memoryKey, vector, now }) => {
    const dim = vector.length;
    if (!isConvexVectorDimension(dim)) {
      throw new Error(`upsertMemorySearchMetaVector: unsupported embedding dimension ${dim}`);
    }
    const memoryId = ids.memory(namespace, memoryKey);
    const sourceMapId = ids.sourceMap(memoryId, MEMORY_SEARCH_META_SOURCE_KEY);
    await deleteVectorFeaturesBySourceMapId(ctx, sourceMapId);
    const mem = await ctx.db
      .query("memories")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .unique();
    if (!mem) throw new Error("upsertMemorySearchMetaVector: memory not found");
    const vectorFeatureId = ids.vectorFeature(sourceMapId);
    const ns = namespacePath(mem.namespace);
    const table = vectorTableNameForDim(dim as ConvexVectorDimension);
    await ctx.db.insert(table, {
      vectorFeatureId,
      memoryId,
      namespace: mem.namespace,
      ...namespacePrefixFields(ns),
      sourceMapId,
      vector,
      tsCreated: now,
    });
    return null;
  },
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
