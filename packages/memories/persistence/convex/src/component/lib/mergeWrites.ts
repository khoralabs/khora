import { ids, namespacePath, namespacePrefixFieldsCamel } from "@cfd/memories-core";
import type { MutationCtx, QueryCtx } from "../_generated/server.js";
import { buildCanonicalMemorySearchMetaText, MEMORY_SEARCH_META_SOURCE_KEY } from "./helpers.js";
import {
  CONVEX_VECTOR_DIMENSIONS,
  type ConvexVectorDimension,
  isConvexVectorDimension,
  vectorTableNameForDim,
} from "./vectorConfig.js";
import { deleteMemoryScopesForMemoryImpl } from "./scopesConvex.js";

export async function loadMemoryNamespaceKeyImpl(
  ctx: QueryCtx | MutationCtx,
  memoryId: string,
): Promise<{ namespace: string; key: string } | undefined> {
  const row = await ctx.db
    .query("memories")
    .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
    .unique();
  if (!row) return undefined;
  return { namespace: row.namespace, key: row.key };
}

export async function deleteVectorFeaturesBySourceMapId(
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

export async function removeMemorySearchMeta(ctx: MutationCtx, memoryId: string): Promise<void> {
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

/** Deletes indexed features and source maps for one memory (no graph topology). */
async function deleteIndexedFeaturesForMemory(ctx: MutationCtx, memoryId: string): Promise<void> {
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
}

async function deleteIncidentEdgesForNode(ctx: MutationCtx, nodeId: string): Promise<void> {
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
    if (e.edgeId === undefined || seen.has(e.edgeId)) continue;
    seen.add(e.edgeId);
    const linked = await ctx.db
      .query("memories")
      .withIndex("by_edgeId", (q) => q.eq("edgeId", e.edgeId))
      .collect();
    for (const m of linked) {
      if (m.memoryId === undefined) continue;
      await deleteIndexedFeaturesForMemory(ctx, m.memoryId);
      if (m._id !== undefined) await ctx.db.delete(m._id);
    }
    const assigns = await ctx.db
      .query("edge_label_assignments")
      .withIndex("by_edge_label", (q) => q.eq("edgeId", e.edgeId))
      .collect();
    for (const a of assigns) await ctx.db.delete(a._id);
    await ctx.db.delete(e._id);
  }
}

export async function clearMemorySubtreeImpl(
  ctx: MutationCtx,
  input:
    | { memoryKind: "node"; memoryId: string; nodeId: string }
    | { memoryKind: "edge"; memoryId: string; edgeId: string },
): Promise<void> {
  await deleteMemoryScopesForMemoryImpl(ctx, input.memoryId);
  if (input.memoryKind === "edge") {
    await deleteIndexedFeaturesForMemory(ctx, input.memoryId);
    const assigns = await ctx.db
      .query("edge_label_assignments")
      .withIndex("by_edge_label", (q) => q.eq("edgeId", input.edgeId))
      .collect();
    for (const a of assigns) await ctx.db.delete(a._id);
    return;
  }

  await deleteIndexedFeaturesForMemory(ctx, input.memoryId);
  await deleteIncidentEdgesForNode(ctx, input.nodeId);

  const nlas = await ctx.db
    .query("node_label_assignments")
    .withIndex("by_node_label", (q) => q.eq("nodeId", input.nodeId))
    .collect();
  for (const r of nlas) await ctx.db.delete(r._id);
}

export async function findMemoryIdByKey(
  ctx: MutationCtx,
  namespace: string,
  key: string,
): Promise<string | undefined> {
  const mem = await ctx.db
    .query("memories")
    .withIndex("by_namespace_key", (q) => q.eq("namespace", namespace).eq("key", key))
    .unique();
  return mem?.memoryId;
}

export async function findMemoryAssociationImpl(
  ctx: MutationCtx,
  namespace: string,
  key: string,
): Promise<
  | { memoryId: string; kind: "node"; nodeId: string }
  | { memoryId: string; kind: "edge"; edgeId: string }
  | null
> {
  const memoryId = ids.memory(namespace, key);
  const row = await ctx.db
    .query("memories")
    .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
    .unique();
  if (!row) return null;
  const kind = row.kind ?? "node";
  if (kind === "edge") {
    if (!row.edgeId)
      throw new Error(`findMemoryAssociation: edge memory missing edgeId for ${key}`);
    return { memoryId, kind: "edge", edgeId: row.edgeId };
  }
  return { memoryId, kind: "node", nodeId: ids.node(namespace, key) };
}

export async function nodeExists(ctx: MutationCtx, nodeId: string): Promise<boolean> {
  const n = await ctx.db
    .query("nodes")
    .withIndex("by_nodeId", (q) => q.eq("nodeId", nodeId))
    .unique();
  return n !== null;
}

export async function upsertMemoryImpl(
  ctx: MutationCtx,
  args: {
    namespace: string;
    key: string;
    now: number;
    kind?: "node" | "edge";
    edgeId?: string | null;
  },
): Promise<{ memoryId: string; _ts_created: number }> {
  const { namespace, key, now } = args;
  const kind = args.kind ?? "node";
  const edgeId = kind === "edge" ? (args.edgeId ?? undefined) : undefined;
  const memoryId = ids.memory(namespace, key);
  const existing = await ctx.db
    .query("memories")
    .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
    .unique();
  const tsCreated = existing?.tsCreated ?? now;
  if (existing) {
    await ctx.db.patch(existing._id, {
      namespace,
      key,
      kind,
      edgeId,
      tsCreated,
    });
  } else {
    await ctx.db.insert("memories", {
      memoryId,
      namespace,
      key,
      kind,
      edgeId,
      tsCreated: now,
    });
  }
  return { memoryId, _ts_created: tsCreated };
}

export async function upsertNodeForMemoryKeyImpl(
  ctx: MutationCtx,
  args: {
    namespace: string;
    memoryKey: string;
    memoryId: string;
    properties?: Record<string, unknown>;
    now: number;
  },
): Promise<{ nodeId: string }> {
  const { namespace, memoryKey, memoryId, properties, now } = args;
  const nodeId = ids.node(namespace, memoryKey);
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
}

export async function insertSourceMapImpl(
  ctx: MutationCtx,
  args: { memoryId: string; sourceKey: string; now: number },
): Promise<{ sourceMapId: string }> {
  const { memoryId, sourceKey, now } = args;
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
    sourceKey,
    tsCreated: now,
  });
  return { sourceMapId };
}

export async function insertLexicalFeatureImpl(
  ctx: MutationCtx,
  args: { memoryId: string; sourceMapId: string; text: string; now: number },
): Promise<{ textFeatureId: string }> {
  const { memoryId, sourceMapId, text, now } = args;
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
    ...namespacePrefixFieldsCamel(ns),
    sourceMapId,
    text,
    tsCreated: now,
  });
  return { textFeatureId };
}

export async function insertVectorFeatureImpl(
  ctx: MutationCtx,
  args: { memoryId: string; sourceMapId: string; vector: number[]; now: number },
): Promise<{ vectorFeatureId: string }> {
  const { memoryId, sourceMapId, vector, now } = args;
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
    ...namespacePrefixFieldsCamel(ns),
    sourceMapId,
    vector,
    tsCreated: now,
  });
  return { vectorFeatureId };
}

export async function ensureNodeLabelImpl(
  ctx: MutationCtx,
  args: {
    kind: string;
    description?: string;
    schemaJson?: string | null;
    now: number;
  },
): Promise<string> {
  const { kind, description, schemaJson, now } = args;
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
}

export async function insertNodeLabelAssignmentImpl(
  ctx: MutationCtx,
  args: { nodeId: string; labelId: string; props: Record<string, unknown>; now: number },
): Promise<void> {
  const { nodeId, labelId, props, now } = args;
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
}

export async function insertEdgeImpl(
  ctx: MutationCtx,
  args: {
    fromNodeId: string;
    toNodeId: string;
    properties?: Record<string, unknown>;
    idParts: { label: string; fromMemoryId: string; toMemoryId: string };
    now: number;
  },
): Promise<{ edgeId: string }> {
  const { fromNodeId, toNodeId, properties, idParts, now } = args;
  const fromNode = await ctx.db
    .query("nodes")
    .withIndex("by_nodeId", (q) => q.eq("nodeId", fromNodeId))
    .unique();
  if (!fromNode) throw new Error("insertEdge: from node not found");
  const edgeId = ids.edge(
    fromNodeId,
    toNodeId,
    idParts.label,
    idParts.fromMemoryId,
    idParts.toMemoryId,
  );
  const propertiesJson = properties === undefined ? undefined : JSON.stringify(properties ?? {});
  const existingEdge = await ctx.db
    .query("edges")
    .withIndex("by_edgeId", (q) => q.eq("edgeId", edgeId))
    .unique();
  if (existingEdge?._id !== undefined) {
    await ctx.db.patch(existingEdge._id, {
      fromNodeId,
      toNodeId,
      namespace: fromNode.namespace,
      propertiesJson,
      idPartsFromMemoryId: idParts.fromMemoryId,
      idPartsToMemoryId: idParts.toMemoryId,
      idPartsLabel: idParts.label,
      tsCreated: now,
    });
  } else {
    await ctx.db.insert("edges", {
      edgeId,
      fromNodeId,
      toNodeId,
      namespace: fromNode.namespace,
      propertiesJson,
      idPartsFromMemoryId: idParts.fromMemoryId,
      idPartsToMemoryId: idParts.toMemoryId,
      idPartsLabel: idParts.label,
      tsCreated: now,
    });
  }
  return { edgeId };
}

export async function ensureEdgeLabelImpl(
  ctx: MutationCtx,
  args: {
    kind: string;
    description?: string;
    schemaJson?: string | null;
    now: number;
  },
): Promise<string> {
  const { kind, description, schemaJson, now } = args;
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
}

export async function insertEdgeLabelAssignmentImpl(
  ctx: MutationCtx,
  args: { edgeId: string; labelId: string; props: Record<string, unknown>; now: number },
): Promise<void> {
  const { edgeId, labelId, props, now } = args;
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
}

export async function syncMemorySearchMetaImpl(
  ctx: MutationCtx,
  args: {
    namespace: string;
    memoryKey: string;
    now: number;
    metaVector?: number[];
  },
): Promise<void> {
  const { namespace, memoryKey, now, metaVector } = args;
  const memoryId = ids.memory(namespace, memoryKey);
  const text = await buildCanonicalMemorySearchMetaText(ctx, namespace, memoryKey);
  await removeMemorySearchMeta(ctx, memoryId);
  if (text.length === 0) return;
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
    sourceKey: MEMORY_SEARCH_META_SOURCE_KEY,
    tsCreated: now,
  });
  const textFeatureId = ids.textFeature(sourceMapId);
  const ns = namespacePath(mem.namespace);
  await ctx.db.insert("text_features", {
    textFeatureId,
    memoryId,
    namespace: mem.namespace,
    ...namespacePrefixFieldsCamel(ns),
    sourceMapId,
    text,
    tsCreated: now,
  });
  if (metaVector !== undefined && metaVector.length > 0) {
    const dim = metaVector.length;
    if (!isConvexVectorDimension(dim)) {
      throw new Error(`syncMemorySearchMeta: unsupported embedding dimension ${dim}`);
    }
    const vectorFeatureId = ids.vectorFeature(sourceMapId);
    const table = vectorTableNameForDim(dim as ConvexVectorDimension);
    await ctx.db.insert(table, {
      vectorFeatureId,
      memoryId,
      namespace: mem.namespace,
      ...namespacePrefixFieldsCamel(ns),
      sourceMapId,
      vector: metaVector,
      tsCreated: now,
    });
  }
}

export async function upsertMemorySearchMetaVectorImpl(
  ctx: MutationCtx,
  args: { namespace: string; memoryKey: string; vector: number[]; now: number },
): Promise<void> {
  const { namespace, memoryKey, vector, now } = args;
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
    ...namespacePrefixFieldsCamel(ns),
    sourceMapId,
    vector,
    tsCreated: now,
  });
}
