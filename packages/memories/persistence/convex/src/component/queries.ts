import type { HydratedSourceMapHit, SearchNamespaceScope } from "@cfd/memories-core";
import {
  canonicalizeNamespacePrefixes,
  ids,
  namespacePath,
  namespacePrefixFieldForDepthCamel,
  namespaceSegments,
} from "@cfd/memories-core";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";
import { internalQuery, type QueryCtx, query } from "./_generated/server.js";
import {
  listIncidentGraphEdges as listIncidentGraphEdgesImpl,
  loadGraphEdge as loadGraphEdgeImpl,
  loadGraphEdgesForNamespace as loadGraphEdgesForNamespaceImpl,
  loadGraphNode as loadGraphNodeImpl,
  loadNodeLabelsForMemory as loadNodeLabelsForMemoryImpl,
  loadNodeLabelsForNamespaceEntries,
  loadNodePropertiesForMemory as loadNodePropertiesForMemoryImpl,
  loadNodePropertiesForNamespaceEntries,
} from "./lib/graphReads.js";
import {
  buildCanonicalMemorySearchMetaText,
  lexicalTextForMemorySource,
  listNeighborMemoriesForNode,
  parsePropsJson,
} from "./lib/helpers.js";
import { loadMemoryNamespaceKeyImpl } from "./lib/mergeWrites.js";
import {
  listNeighborsForEdgeMemory as listNeighborsForEdgeMemoryImpl,
  listNeighborsForMemory as listNeighborsForMemoryImpl,
} from "./lib/neighborReads.js";
import { getProvenanceHeadRootHexImpl } from "./lib/provenanceConvex.js";
import { intersectMemoryAllowlists, memoryIdsMatchingScope } from "./lib/scopeSearchConvex.js";
import { CONVEX_VECTOR_DIMENSIONS, vectorTableNameForDim } from "./lib/vectorConfig.js";

const vHydratedLabel = v.object({
  kind: v.string(),
  props: v.record(v.string(), v.any()),
});

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

const vHydratedNeighbor = v.object({
  _id: v.string(),
  _ts_created: v.number(),
  namespace: v.string(),
  key: v.string(),
  labels: v.array(vHydratedLabel),
  edge: v.object({
    _id: v.string(),
    _ts_created: v.number(),
    from_node_id: v.string(),
    to_node_id: v.string(),
    properties: v.optional(v.record(v.string(), v.any())),
    label: vHydratedLabel,
  }),
});

const vGraphEdgeLink = v.object({
  edgeId: v.string(),
  fromKey: v.string(),
  toKey: v.string(),
  labels: v.array(vHydratedLabel),
  properties: v.optional(v.union(v.record(v.string(), v.any()), v.null())),
  directed: v.optional(v.boolean()),
});

const vGraphNode = v.object({
  namespace: v.string(),
  memoryKey: v.string(),
  nodeId: v.string(),
  labels: v.array(vHydratedLabel),
  properties: v.union(v.record(v.string(), v.any()), v.null()),
});

const vMemoryGraphAssociation = v.union(
  v.object({ kind: v.literal("node") }),
  v.object({ kind: v.literal("edge"), edge: vGraphEdgeLink }),
);

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
    kind: v.optional(v.union(v.literal("node"), v.literal("edge"))),
    edge_id: v.optional(v.string()),
  }),
  labels: v.array(vHydratedLabel),
  graph: vMemoryGraphAssociation,
});

export const findMemoryAssociation = query({
  args: { namespace: v.string(), key: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      memoryId: v.string(),
      kind: v.literal("node"),
      nodeId: v.string(),
    }),
    v.object({
      memoryId: v.string(),
      kind: v.literal("edge"),
      edgeId: v.string(),
    }),
  ),
  handler: async (ctx, { namespace, key }) => {
    const memoryId = ids.memory(namespace, key);
    const row = await ctx.db
      .query("memories")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
      .unique();
    if (!row) return null;
    const kind = row.kind ?? "node";
    if (kind === "edge") {
      if (!row.edgeId) {
        throw new Error(`findMemoryAssociation: edge memory missing edgeId for ${key}`);
      }
      return { memoryId, kind: "edge" as const, edgeId: row.edgeId };
    }
    return { memoryId, kind: "node" as const, nodeId: ids.node(namespace, key) };
  },
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

export const listNeighborMemoriesForNodeQuery = query({
  args: { namespace: v.string(), nodeId: v.string() },
  returns: v.array(
    v.object({
      namespace: v.string(),
      key: v.string(),
    }),
  ),
  handler: async (ctx, { namespace, nodeId }) => {
    return listNeighborMemoriesForNode(ctx, namespace, nodeId);
  },
});

export const loadMemoryNamespaceKey = query({
  args: { memoryId: v.string() },
  returns: v.union(v.null(), v.object({ namespace: v.string(), key: v.string() })),
  handler: async (ctx, { memoryId }) => {
    return (await loadMemoryNamespaceKeyImpl(ctx, memoryId)) ?? null;
  },
});

export const listScopesForMemory = query({
  args: { memoryId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { memoryId }) => {
    const rows = await ctx.db
      .query("memory_scopes")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .collect();
    return [...new Set(rows.map((r) => r.scopeId))].sort((a, b) => a.localeCompare(b));
  },
});

export const buildCanonicalMemorySearchMetaTextQuery = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  returns: v.string(),
  handler: async (ctx, { namespace, memoryKey }) => {
    return buildCanonicalMemorySearchMetaText(ctx, namespace, memoryKey);
  },
});

/** One search arm: full-text on `text` with a single `nsPrefix_k` filter for subtree `rootPath`. */
function searchLexicalOne(ctx: QueryCtx, args: { rootPath: string; text: string }) {
  const segs = namespaceSegments(namespacePath(args.rootPath));
  const depth = segs.length;
  const field = namespacePrefixFieldForDepthCamel(depth);
  return ctx.db
    .query("text_features")
    .withSearchIndex("search_text", (sq) => sq.search("text", args.text).eq(field, args.rootPath));
}

const ROUND_ROBIN_SLACK = 4;

export const memoryIdsMatchingScopeInternal = internalQuery({
  args: {
    kind: v.union(v.literal("scopeDag"), v.literal("exactScope")),
    roots: v.optional(v.array(v.string())),
    scopes: v.optional(v.array(v.string())),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const scope =
      args.kind === "scopeDag"
        ? ({ kind: "scopeDag", roots: args.roots ?? [] } as SearchNamespaceScope)
        : ({ kind: "exactScope", scopes: args.scopes ?? [] } as SearchNamespaceScope);
    return (await memoryIdsMatchingScope(ctx, scope)) ?? [];
  },
});

function scopeFromValidator(scope: {
  kind: "unscoped" | "pathSubtree" | "scopeDag" | "exactScope";
  namespaces?: string[];
  roots?: string[];
  scopes?: string[];
}): SearchNamespaceScope {
  if (scope.kind === "unscoped") return { kind: "unscoped" };
  if (scope.kind === "pathSubtree") {
    return { kind: "pathSubtree", namespaces: scope.namespaces ?? [] };
  }
  if (scope.kind === "scopeDag") {
    return { kind: "scopeDag", roots: scope.roots ?? [] };
  }
  return { kind: "exactScope", scopes: scope.scopes ?? [] };
}

export const searchLexicalSourceMapIds = query({
  args: {
    scope: v.object({
      kind: v.union(
        v.literal("unscoped"),
        v.literal("pathSubtree"),
        v.literal("scopeDag"),
        v.literal("exactScope"),
      ),
      namespaces: v.optional(v.array(v.string())),
      roots: v.optional(v.array(v.string())),
      scopes: v.optional(v.array(v.string())),
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
    if (raw.text.trim().length === 0) return [];

    const scopedIds = await memoryIdsMatchingScope(ctx, scope);
    let memoryFilterIds = raw.memoryIds;
    if (scopedIds !== undefined) {
      const merged = intersectMemoryAllowlists(raw.memoryIds, scopedIds);
      if (merged.length === 0) return [];
      memoryFilterIds = merged;
    }

    /** DB-wide lexical search: search index without namespace filter; optional memoryIds allowlist. */
    if (scope.kind === "unscoped") {
      const K = Math.max(raw.limit * 8, 100);
      const memoryIdSet = memoryFilterIds === undefined ? undefined : new Set(memoryFilterIds);
      const rows = await ctx.db
        .query("text_features")
        .withSearchIndex("search_text", (sq) => sq.search("text", raw.text))
        .take(K);
      const out: string[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        if (memoryIdSet !== undefined && !memoryIdSet.has(row.memoryId)) continue;
        const sid = row.sourceMapId;
        if (!seen.has(sid)) {
          seen.add(sid);
          out.push(sid);
          if (out.length >= raw.limit) break;
        }
      }
      return out;
    }

    if (scope.kind === "scopeDag" || scope.kind === "exactScope") {
      const K = Math.max(raw.limit * 8, 100);
      const memoryIdSet = new Set(memoryFilterIds ?? []);
      const rows = await ctx.db
        .query("text_features")
        .withSearchIndex("search_text", (sq) => sq.search("text", raw.text))
        .take(K);
      const out: string[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        if (!memoryIdSet.has(row.memoryId)) continue;
        const sid = row.sourceMapId;
        if (!seen.has(sid)) {
          seen.add(sid);
          out.push(sid);
          if (out.length >= raw.limit) break;
        }
      }
      return out;
    }

    const namespaces = scope.namespaces ?? [];
    if (namespaces.length === 0) return [];

    const roots = canonicalizeNamespacePrefixes(namespaces.map((ns) => namespacePath(ns)));
    const armCount = roots.length;
    const K = Math.max(2, Math.ceil(raw.limit / armCount)) + ROUND_ROBIN_SLACK;
    const memoryIdSet = memoryFilterIds === undefined ? undefined : new Set(memoryFilterIds);

    const rowsPerArm = await Promise.all(
      roots.map((rootPath) => searchLexicalOne(ctx, { rootPath, text: raw.text }).take(K)),
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
      const mk = mem.kind ?? "node";
      const memory = {
        _id: mem.memoryId,
        _ts_created: mem.tsCreated,
        namespace: namespacePath(mem.namespace),
        key: mem.key,
        kind: mk === "edge" ? ("edge" as const) : ("node" as const),
        ...(mk === "edge" && mem.edgeId ? { edge_id: mem.edgeId } : {}),
      };

      if (mk === "edge" && mem.edgeId) {
        const edgeId = mem.edgeId;
        const link = await loadGraphEdgeImpl(ctx, mem.namespace, edgeId);
        const elas = await ctx.db
          .query("edge_label_assignments")
          .withIndex("by_edge_label", (q) => q.eq("edgeId", edgeId))
          .collect();
        const labels: Array<{ kind: string; props: Record<string, unknown> }> = [];
        for (const a of elas) {
          const el = await ctx.db
            .query("edge_labels")
            .withIndex("by_labelId", (q) => q.eq("labelId", a.labelId))
            .unique();
          if (el) labels.push({ kind: el.kind, props: parsePropsJson(a.propsJson) });
        }
        labels.sort((a, b) => a.kind.localeCompare(b.kind));
        hits.push({
          _id: sm.sourceMapId,
          _ts_created: sm.tsCreated,
          memory_id: sm.memoryId,
          source_key: sm.sourceKey,
          memory,
          labels,
          graph: link ? { kind: "edge" as const, edge: link } : { kind: "node" as const },
        });
        continue;
      }

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
        source_key: sm.sourceKey,
        memory,
        labels,
        graph: { kind: "node" as const },
      });
    }
    return hits;
  },
});

export const listNeighborsForMemory = query({
  args: {
    namespace: v.string(),
    key: v.string(),
    filters: v.optional(vNeighborFilter),
  },
  returns: v.array(vHydratedNeighbor),
  handler: async (ctx, args) =>
    listNeighborsForMemoryImpl(ctx, {
      namespace: args.namespace,
      key: args.key,
      ...(args.filters !== undefined ? { filters: args.filters } : {}),
    }),
});

export const listNeighborsForEdgeMemory = query({
  args: {
    namespace: v.string(),
    edgeId: v.string(),
    filters: v.optional(vNeighborFilter),
  },
  returns: v.array(vHydratedNeighbor),
  handler: async (ctx, args) =>
    listNeighborsForEdgeMemoryImpl(ctx, {
      namespace: args.namespace,
      edgeId: args.edgeId,
      ...(args.filters !== undefined ? { filters: args.filters } : {}),
    }),
});

export const loadGraphEdgesForNamespace = query({
  args: { namespace: v.string() },
  returns: v.array(vGraphEdgeLink),
  handler: async (ctx, { namespace }) => loadGraphEdgesForNamespaceImpl(ctx, namespace),
});

export const listIncidentGraphEdges = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  returns: v.array(vGraphEdgeLink),
  handler: async (ctx, { namespace, memoryKey }) =>
    listIncidentGraphEdgesImpl(ctx, namespace, memoryKey),
});

export const loadGraphEdge = query({
  args: { namespace: v.string(), edgeId: v.string() },
  returns: v.union(vGraphEdgeLink, v.null()),
  handler: async (ctx, { namespace, edgeId }) => loadGraphEdgeImpl(ctx, namespace, edgeId),
});

export const loadNodeLabelsForMemory = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  returns: v.array(vHydratedLabel),
  handler: async (ctx, { namespace, memoryKey }) =>
    loadNodeLabelsForMemoryImpl(ctx, namespace, memoryKey),
});

export const loadNodePropertiesForMemory = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  returns: v.union(v.record(v.string(), v.any()), v.null()),
  handler: async (ctx, { namespace, memoryKey }) =>
    loadNodePropertiesForMemoryImpl(ctx, namespace, memoryKey),
});

export const loadGraphNode = query({
  args: { namespace: v.string(), memoryKey: v.string() },
  returns: v.union(vGraphNode, v.null()),
  handler: async (ctx, { namespace, memoryKey }) => loadGraphNodeImpl(ctx, namespace, memoryKey),
});

export const loadNodeLabelsForNamespace = query({
  args: { namespace: v.string() },
  returns: v.array(
    v.object({
      memoryKey: v.string(),
      labels: v.array(vHydratedLabel),
    }),
  ),
  handler: async (ctx, { namespace }) => loadNodeLabelsForNamespaceEntries(ctx, namespace),
});

export const loadNodePropertiesForNamespace = query({
  args: { namespace: v.string() },
  returns: v.array(
    v.object({
      memoryKey: v.string(),
      properties: v.union(v.record(v.string(), v.any()), v.null()),
    }),
  ),
  handler: async (ctx, { namespace }) => loadNodePropertiesForNamespaceEntries(ctx, namespace),
});

export const listSourceMapsForMemory = query({
  args: { memoryId: v.string(), limit: v.number() },
  returns: v.array(
    v.object({
      _id: v.string(),
      _ts_created: v.number(),
      memory_id: v.string(),
      source_key: v.string(),
      content_hash: v.optional(v.string()),
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
      source_key: sm.sourceKey,
      ...(sm.contentHash !== undefined ? { content_hash: sm.contentHash } : {}),
    }));
  },
});

export const getProvenanceHeadRootHex = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => (await getProvenanceHeadRootHexImpl(ctx)) ?? null,
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
        source_key: sm.sourceKey,
        text: tf.text,
      });
    }
    return out;
  },
});

/** Returns supported embedding widths for this backend (fixed set), not dimensions inferred from stored vectors. */
export const listVectorEmbeddingIndexDimensions = query({
  args: {},
  returns: v.array(v.number()),
  handler: async () => [...CONVEX_VECTOR_DIMENSIONS],
});

/** Load vector feature rows after `ctx.vectorSearch` (actions cannot use `ctx.db` directly). */
export const getVectorFeatureRowsByIds = internalQuery({
  args: {
    dimension: v.union(v.literal(768), v.literal(1024), v.literal(1536), v.literal(3072)),
    ids: v.array(v.string()),
  },
  returns: v.array(
    v.union(
      v.null(),
      v.object({
        sourceMapId: v.string(),
        memoryId: v.string(),
        namespace: v.string(),
      }),
    ),
  ),
  handler: async (ctx, { dimension, ids }) => {
    const table = vectorTableNameForDim(dimension);
    const out: Array<{
      sourceMapId: string;
      memoryId: string;
      namespace: string;
    } | null> = [];
    for (const id of ids) {
      const doc = await ctx.db.get(id as Id<typeof table>);
      if (!doc) {
        out.push(null);
        continue;
      }
      out.push({
        sourceMapId: doc.sourceMapId,
        memoryId: doc.memoryId,
        namespace: doc.namespace,
      });
    }
    return out;
  },
});
