import type { HydratedSourceMapHit, SearchNamespaceScope } from "@cfd/memories-core";
import {
  canonicalizeNamespacePrefixes,
  ids,
  namespacePath,
  namespaceSegments,
} from "@cfd/memories-core";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server.js";
import { query } from "./_generated/server.js";
import {
  buildCanonicalMemorySearchMetaText,
  lexicalTextForMemorySource,
  listNeighborMemoryKeysForNode,
  parsePropsJson,
} from "./lib/helpers.js";

const vHydratedLabel = v.object({
  kind: v.string(),
  props: v.record(v.string(), v.any()),
});

const vHydratedSourceMapHit = v.object({
  _id: v.string(),
  _ts_created: v.number(),
  memory_id: v.string(),
  source_key: v.string(),
  memory: v.object({
    _id: v.string(),
    _ts_created: v.number(),
    namespace: v.string(),
    key: v.string(),
  }),
  labels: v.array(vHydratedLabel),
});

export const findMemoryIdByKey = query({
  args: { namespace: v.string(), key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { namespace, key }) => {
    const row = await ctx.db
      .query("memories")
      .withIndex("by_namespace_key", (q) => q.eq("namespace", namespace).eq("key", key))
      .unique();
    return row?.memoryId ?? null;
  },
});

export const listMemoriesInNamespace = query({
  args: { namespace: v.string() },
  returns: v.array(
    v.object({
      memoryId: v.string(),
      key: v.string(),
      tsCreated: v.number(),
      /** Lexical text for the `body` source (same convention as the demo merge). */
      bodyText: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { namespace }) => {
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_namespace_key", (q) => q.eq("namespace", namespace))
      .collect();
    const out = [];
    for (const r of rows) {
      const bodyText = await lexicalTextForMemorySource(ctx, r.memoryId, "body");
      out.push({
        memoryId: r.memoryId,
        key: r.key,
        tsCreated: r.tsCreated,
        bodyText,
      });
    }
    return out;
  },
});

/** Resolve stored lexical text for a source map (cf. {@link Store} / `JsonlStore` in `@cfd/memories-stores`). */
export const getLexicalTextForMemorySource = query({
  args: {
    memoryId: v.string(),
    sourceKey: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { memoryId, sourceKey }) => {
    return lexicalTextForMemorySource(ctx, memoryId, sourceKey);
  },
});

export const nodeExists = query({
  args: { nodeId: v.string() },
  returns: v.boolean(),
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
  returns: v.array(v.string()),
  handler: async (ctx, { namespace, nodeId }) => {
    return listNeighborMemoryKeysForNode(ctx, namespace, nodeId);
  },
});

export const buildCanonicalMemorySearchMetaTextQuery = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  returns: v.string(),
  handler: async (ctx, { namespace, memoryKey }) => {
    return buildCanonicalMemorySearchMetaText(ctx, namespace, memoryKey);
  },
});

const NS_FILTER_FIELDS = ["ns_l0", "ns_l1", "ns_l2", "ns_l3", "ns_l4", "ns_l5"] as const;

/** One search arm: full-text on `text` with equality filters pinned to a namespace prefix (subtree). */
function searchLexicalOne(
  ctx: QueryCtx,
  args: { prefixSegments: readonly string[]; text: string },
) {
  const segs = args.prefixSegments;
  if (segs.length === 0 || segs.length > NS_FILTER_FIELDS.length) {
    throw new Error("searchLexicalOne: prefix must have 1..6 segments");
  }
  return ctx.db.query("text_features").withSearchIndex("search_text", (sq) => {
    let s = sq.search("text", args.text);
    for (let i = 0; i < segs.length; i++) {
      const field = NS_FILTER_FIELDS[i];
      const seg = segs[i];
      if (field === undefined || seg === undefined) break;
      s = s.eq(field, seg);
    }
    return s;
  });
}

const ROUND_ROBIN_SLACK = 4;

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
  returns: v.array(v.string()),
  handler: async (ctx, raw) => {
    const scope = scopeFromValidator(raw.scope);
    if (raw.text.length === 0) return [];
    if (raw.memoryIds !== undefined && raw.memoryIds.length === 0) return [];
    if (scope.kind === "unscoped") return [];

    const namespaces = scope.namespaces ?? [];
    if (namespaces.length === 0) return [];
    if (raw.text.trim().length === 0) return [];

    const roots = canonicalizeNamespacePrefixes(namespaces.map((ns) => namespacePath(ns)));
    const prefixSegsList = roots.map((p) => namespaceSegments(p));
    const armCount = prefixSegsList.length;
    const K = Math.max(2, Math.ceil(raw.limit / armCount)) + ROUND_ROBIN_SLACK;
    const memoryIdSet = raw.memoryIds === undefined ? undefined : new Set(raw.memoryIds);

    const rowsPerArm = await Promise.all(
      prefixSegsList.map((prefixSegments) =>
        searchLexicalOne(ctx, { prefixSegments, text: raw.text }).take(K),
      ),
    );

    const out: string[] = [];
    const seen = new Set<string>();
    let round = 0;
    while (out.length < raw.limit) {
      let anyLeft = false;
      for (const arm of rowsPerArm) {
        if (round < arm.length) anyLeft = true;
      }
      if (!anyLeft) break;

      for (const arm of rowsPerArm) {
        const row = arm[round];
        if (row === undefined) continue;
        if (memoryIdSet !== undefined && !memoryIdSet.has(row.memoryId)) continue;
        const sid = row.sourceMapId;
        if (!seen.has(sid)) {
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
  returns: v.array(v.string()),
  handler: async () => {
    return [] as string[];
  },
});

export const hydrateSourceMapHits = query({
  args: { sourceMapIds: v.array(v.string()) },
  returns: v.array(vHydratedSourceMapHit),
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
        .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", sm.memoryId))
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
        _ts_created: sm.tsCreated,
        memory_id: sm.memoryId,
        source_key: sm.source_key,
        memory: {
          _id: mem.memoryId,
          _ts_created: mem.tsCreated,
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
  returns: v.array(
    v.object({
      _id: v.string(),
      _ts_created: v.number(),
      namespace: v.string(),
      key: v.string(),
      labels: v.array(vHydratedLabel),
      edge: v.object({
        _id: v.string(),
        _ts_created: v.number(),
        fromNodeId: v.string(),
        toNodeId: v.string(),
        namespace: v.string(),
        propertiesJson: v.optional(v.string()),
        idPartsSelfKey: v.string(),
        idPartsOtherKey: v.string(),
        idPartsLabel: v.string(),
        label: vHydratedLabel,
      }),
    }),
  ),
  handler: async () => {
    return [];
  },
});

export const listSourceMapsForMemory = query({
  args: { memoryId: v.string(), limit: v.number() },
  returns: v.array(
    v.object({
      _id: v.string(),
      _ts_created: v.number(),
      memory_id: v.string(),
      source_key: v.string(),
    }),
  ),
  handler: async (ctx, { memoryId, limit }) => {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError("limit must be a positive integer");
    }
    const rows = await ctx.db
      .query("source_maps")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .order("desc")
      .take(limit);
    return rows.map((sm) => ({
      _id: sm.sourceMapId,
      _ts_created: sm.tsCreated,
      memory_id: sm.memoryId,
      source_key: sm.source_key,
    }));
  },
});

export const listTextFeatureExportRowsForMemory = query({
  args: { memoryId: v.string() },
  returns: v.array(
    v.object({
      memory_id: v.string(),
      source_key: v.string(),
      text: v.string(),
    }),
  ),
  handler: async (ctx, { memoryId }) => {
    const tfs = await ctx.db
      .query("text_features")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
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
  returns: v.array(v.number()),
  handler: async () => [] as number[],
});
