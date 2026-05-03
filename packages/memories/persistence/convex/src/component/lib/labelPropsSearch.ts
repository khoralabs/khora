import {
  formatLabelPropsForSearch,
  ids,
  isNonEmptyProps,
  namespacePath,
  namespacePrefixFieldsCamel,
} from "@cfd/memories-core";
import {
  MEMORY_EDGE_LABEL_PROPS_KEY_PREFIX,
  MEMORY_NODE_LABEL_PROPS_KEY_PREFIX,
  memoryEdgeLabelPropsSourceKey,
  memoryNodeLabelPropsSourceKey,
} from "@cfd/memories-core/search-meta-constants";
import type { MutationCtx } from "../_generated/server.js";
import { CONVEX_VECTOR_DIMENSIONS, vectorTableNameForDim } from "./vectorConfig.js";

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

async function deleteSourceMapBySourceKey(
  ctx: MutationCtx,
  memoryId: string,
  sourceKey: string,
): Promise<void> {
  const sourceMapId = ids.sourceMap(memoryId, sourceKey);
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

export async function removeLabelPropsSearchMaps(
  ctx: MutationCtx,
  memoryId: string,
): Promise<void> {
  const sms = await ctx.db
    .query("source_maps")
    .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
    .collect();
  for (const sm of sms) {
    if (
      sm.sourceKey.startsWith(MEMORY_NODE_LABEL_PROPS_KEY_PREFIX) ||
      sm.sourceKey.startsWith(MEMORY_EDGE_LABEL_PROPS_KEY_PREFIX)
    ) {
      await deleteSourceMapBySourceKey(ctx, memoryId, sm.sourceKey);
    }
  }
}

function parsePropsColumn(raw: unknown): Record<string, unknown> {
  if (raw == null || raw === "") return {};
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw) as unknown;
      if (o && typeof o === "object" && !Array.isArray(o)) return o as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Rebuild label-props lexical chunks; mirrors SQLite `syncLabelPropsSearchFeatures`. */
export async function syncLabelPropsSearchFeaturesImpl(
  ctx: MutationCtx,
  input: { namespace: string; memoryKey: string; now: number },
): Promise<void> {
  const { namespace, memoryKey, now } = input;
  const memoryId = ids.memory(namespace, memoryKey);
  const nodeId = ids.node(namespace, memoryKey);

  await removeLabelPropsSearchMaps(ctx, memoryId);

  const mem0 = await ctx.db
    .query("memories")
    .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
    .unique();
  if (!mem0) throw new Error("syncLabelPropsSearchFeatures: memory not found");
  const memKind = mem0.kind ?? "node";

  if (memKind === "edge" && mem0.edgeId) {
    const elas = await ctx.db
      .query("edge_label_assignments")
      .withIndex("by_edge_label", (q) => q.eq("edgeId", mem0.edgeId!))
      .collect();
    const sorted = [...elas].sort((a, b) =>
      (a.assignmentId ?? "").localeCompare(b.assignmentId ?? ""),
    );
    for (const ela of sorted) {
      const el = await ctx.db
        .query("edge_labels")
        .withIndex("by_labelId", (q) => q.eq("labelId", ela.labelId))
        .unique();
      if (!el) continue;
      const props = parsePropsColumn(ela.propsJson);
      if (!isNonEmptyProps(props)) continue;
      const text = formatLabelPropsForSearch(el.kind, "edge", props, undefined);
      if (text.length === 0) continue;
      const sourceKey = memoryEdgeLabelPropsSourceKey(ela.assignmentId);
      const sourceMapId = ids.sourceMap(memoryId, sourceKey);
      await ctx.db.insert("source_maps", {
        sourceMapId,
        memoryId,
        namespace: mem0.namespace,
        sourceKey,
        tsCreated: now,
      });
      const textFeatureId = ids.textFeature(sourceMapId);
      const ns = namespacePath(mem0.namespace);
      await ctx.db.insert("text_features", {
        textFeatureId,
        memoryId,
        namespace: mem0.namespace,
        ...namespacePrefixFieldsCamel(ns),
        sourceMapId,
        text,
        tsCreated: now,
      });
    }
    return;
  }

  const nlas = await ctx.db
    .query("node_label_assignments")
    .withIndex("by_node_label", (q) => q.eq("nodeId", nodeId))
    .collect();
  const sortedNlas = [...nlas].sort((a, b) =>
    (a.assignmentId ?? "").localeCompare(b.assignmentId ?? ""),
  );

  for (const nla of sortedNlas) {
    const nl = await ctx.db
      .query("node_labels")
      .withIndex("by_labelId", (q) => q.eq("labelId", nla.labelId))
      .unique();
    if (!nl) continue;
    const props = parsePropsColumn(nla.propsJson);
    if (!isNonEmptyProps(props)) continue;
    const text = formatLabelPropsForSearch(nl.kind, "node", props, undefined);
    if (text.length === 0) continue;

    const sourceKey = memoryNodeLabelPropsSourceKey(nla.assignmentId);
    const sourceMapId = ids.sourceMap(memoryId, sourceKey);
    await ctx.db.insert("source_maps", {
      sourceMapId,
      memoryId,
      namespace: mem0.namespace,
      sourceKey,
      tsCreated: now,
    });
    const textFeatureId = ids.textFeature(sourceMapId);
    const ns = namespacePath(mem0.namespace);
    await ctx.db.insert("text_features", {
      textFeatureId,
      memoryId,
      namespace: mem0.namespace,
      ...namespacePrefixFieldsCamel(ns),
      sourceMapId,
      text,
      tsCreated: now,
    });
  }
}
