import type { HydratedSourceMapHit, SearchNamespaceScope } from "@cfd/memories-core";
import { ids } from "@cfd/memories-core";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server.js";
import { query } from "./_generated/server.js";
import {
  buildCanonicalMemorySearchMetaText,
  listNeighborMemoryKeysForNode,
  parsePropsJson,
} from "./lib/helpers.js";

export const findMemoryIdByKey = query({
  args: { namespace: v.string(), key: v.string() },
  handler: async (ctx, { namespace, key }) => {
    const row = await ctx.db
      .query("memories")
      .withIndex("by_namespace_key", (q) => q.eq("namespace", namespace))
      .filter((q) => q.eq(q.field("key"), key))
      .unique();
    return row?.memoryId;
  },
});

export const nodeExists = query({
  args: { nodeId: v.string() },
  handler: async (ctx, { nodeId }) => {
    const row = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", nodeId))
      .unique();
    return row != null;
  },
});

export const listNeighborMemoryKeysForNodeQuery = query({
  args: { namespace: v.string(), nodeId: v.string() },
  handler: async (ctx, { namespace, nodeId }) => {
    return listNeighborMemoryKeysForNode(ctx, namespace, nodeId);
  },
});

export const buildCanonicalMemorySearchMetaTextQuery = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  handler: async (ctx, { namespace, memoryKey }) => {
    return buildCanonicalMemorySearchMetaText(ctx, namespace, memoryKey);
  },
});

async function searchLexicalOne(
  ctx: QueryCtx,
  args: {
    namespace: string;
    text: string;
    limit: number;
    memoryId?: string;
  },
): Promise<string[]> {
  if (args.text.trim().length === 0) return [];
  const rows = await ctx.db
    .query("text_features")
    .withSearchIndex("search_text", (sq) => {
      let s = sq.search("text", args.text).eq("namespace", args.namespace);
      if (args.memoryId !== undefined) {
        s = s.eq("memoryId", args.memoryId);
      }
      return s;
    })
    .take(args.limit);
  return rows.map((row) => row.sourceMapId as string);
}

function scopeFromValidator(scope: {
  kind: "union" | "unscoped";
  namespaces?: string[];
}): SearchNamespaceScope {
  if (scope.kind === "unscoped") return { kind: "unscoped" };
  return { kind: "union", namespaces: scope.namespaces ?? [] };
}

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
  handler: async (ctx, raw) => {
    const scope = scopeFromValidator(raw.scope);
    if (raw.text.length === 0) return [];
    if (raw.memoryIds !== undefined && raw.memoryIds.length === 0) return [];
    if (scope.kind === "unscoped") return [];

    const namespaces = scope.namespaces ?? [];
    if (namespaces.length === 0) return [];

    const memoryIds = raw.memoryIds;

    const arms: string[][] = [];

    for (const ns of namespaces) {
      if (memoryIds === undefined) {
        const hitIds = await searchLexicalOne(ctx, {
          namespace: ns,
          text: raw.text,
          limit: Math.max(raw.limit * 4, raw.limit),
        });
        arms.push(hitIds);
      } else {
        for (const mid of memoryIds) {
          const hitIds = await searchLexicalOne(ctx, {
            namespace: ns,
            text: raw.text,
            limit: Math.max(raw.limit * 4, raw.limit),
            memoryId: mid,
          });
          arms.push(hitIds);
        }
      }
    }

    const out: string[] = [];
    const seen = new Set<string>();
    let round = 0;
    while (out.length < raw.limit) {
      let anyLeft = false;
      for (const arm of arms) {
        if (round < arm.length) anyLeft = true;
      }
      if (!anyLeft) break;

      for (const arm of arms) {
        const sid = arm[round];
        if (sid !== undefined && !seen.has(sid)) {
          seen.add(sid);
          out.push(sid);
          if (out.length >= raw.limit) break;
        }
      }
      round++;
    }
    return out;
  },
});

export const searchVectorSourceMapIds = query({
  args: {
    scope: v.object({
      kind: v.union(v.literal("union"), v.literal("unscoped")),
      namespaces: v.optional(v.array(v.string())),
    }),
    limit: v.number(),
    vector: v.array(v.number()),
    memoryIds: v.optional(v.array(v.string())),
  },
  handler: async () => {
    return [] as string[];
  },
});

export const hydrateSourceMapHits = query({
  args: { sourceMapIds: v.array(v.string()) },
  handler: async (ctx, { sourceMapIds }): Promise<HydratedSourceMapHit[]> => {
    if (sourceMapIds.length === 0) return [];
    const hits: HydratedSourceMapHit[] = [];
    for (const sourceMapId of sourceMapIds) {
      const sm = await ctx.db
        .query("source_maps")
        .withIndex("by_sourceMapId", (q) => q.eq("sourceMapId", sourceMapId))
        .unique();
      if (!sm) continue;
      const mem = await ctx.db
        .query("memories")
        .withIndex("by_memoryId", (q) => q.eq("memoryId", sm.memoryId))
        .unique();
      if (!mem) continue;
      const nodeId = ids.node(mem.namespace, mem.key);
      const assignments = await ctx.db
        .query("node_label_assignments")
        .withIndex("by_node_label", (q) => q.eq("nodeId", nodeId))
        .collect();
      const labels: Array<{ kind: string; props: Record<string, unknown> }> = [];
      for (const a of assignments) {
        const nl = await ctx.db
          .query("node_labels")
          .withIndex("by_labelId", (q) => q.eq("labelId", a.labelId))
          .unique();
        if (nl) {
          labels.push({ kind: nl.kind, props: parsePropsJson(a.propsJson) });
        }
      }
      labels.sort((a, b) => a.kind.localeCompare(b.kind));
      hits.push({
        _id: sm.sourceMapId,
        _ts_created: sm._ts_created,
        memory_id: sm.memoryId,
        source_key: sm.source_key,
        memory: {
          _id: mem.memoryId,
          _ts_created: mem._ts_created,
          namespace: mem.namespace,
          key: mem.key,
        },
        labels,
      });
    }
    return hits;
  },
});

export const listNeighborsForMemory = query({
  args: {
    namespace: v.string(),
    key: v.string(),
  },
  handler: async () => {
    return [] as const;
  },
});

export const listSourceMapsForMemory = query({
  args: { memoryId: v.string(), limit: v.number() },
  handler: async (ctx, { memoryId, limit }) => {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError("limit must be a positive integer");
    }
    const rows = await ctx.db
      .query("source_maps")
      .withIndex("by_memoryId", (q) => q.eq("memoryId", memoryId))
      .collect();
    rows.sort((a, b) => b._ts_created - a._ts_created);
    return rows.slice(0, limit).map((sm) => ({
      _id: sm.sourceMapId,
      _ts_created: sm._ts_created,
      memory_id: sm.memoryId,
      source_key: sm.source_key,
    }));
  },
});

export const listTextFeatureExportRowsForMemory = query({
  args: { memoryId: v.string() },
  handler: async (ctx, { memoryId }) => {
    const tfs = await ctx.db
      .query("text_features")
      .withIndex("by_memoryId", (q) => q.eq("memoryId", memoryId))
      .collect();
    const out: { memory_id: string; source_key: string; text: string }[] = [];
    for (const tf of tfs) {
      const sm = await ctx.db
        .query("source_maps")
        .withIndex("by_sourceMapId", (q) => q.eq("sourceMapId", tf.sourceMapId))
        .unique();
      if (!sm) continue;
      out.push({
        memory_id: sm.memoryId,
        source_key: sm.source_key,
        text: tf.text,
      });
    }
    return out;
  },
});

export const listVectorEmbeddingIndexDimensions = query({
  args: {},
  handler: async () => [] as number[],
});
