import { ids } from "@khoralabs/memories-core";
import { MEMORY_SEARCH_META_SOURCE_KEY } from "@khoralabs/memories-core/search-meta-constants";
import type { MutationCtx, QueryCtx } from "../_generated/server.js";

/** Read-capable Convex context (queries or mutations). */
export type ReadCtx = QueryCtx | MutationCtx;

const EDGE_LABEL_SEP = String.fromCharCode(31);

/**
 * Lexical `text_features.text` for a `(memoryId, sourceKey)` pair, if a row exists.
 * Matches how merge stores body text under {@link ids.sourceMap}(memoryId, sourceKey).
 */
export async function lexicalTextForMemorySource(
  ctx: ReadCtx,
  memoryId: string,
  sourceKey: string,
): Promise<string | null> {
  const sourceMapId = ids.sourceMap(memoryId, sourceKey);
  const tf = await ctx.db
    .query("text_features")
    .withIndex("by_sourceMapId", (q) => q.eq("sourceMapId", sourceMapId))
    .first();
  return tf?.text ?? null;
}

function sortUnique(xs: string[]): string[] {
  return [...new Set(xs)].sort((a, b) => a.localeCompare(b));
}

function formatNodeLines(labels: string[]): string[] {
  return sortUnique(labels).map((l) => `node:${l}`);
}

function formatEdgeLine(
  direction: "in" | "out",
  neighborKey: string,
  edgeLabels: string[],
): string {
  const joined = sortUnique(edgeLabels).join("|");
  return `edge ${direction}:${neighborKey}:${joined}`;
}

function parseEdgeLabelsJoined(s: string | null | undefined): string[] {
  if (!s) return [];
  return sortUnique(s.split(EDGE_LABEL_SEP).filter(Boolean));
}

function parsePropsJson(raw: string): Record<string, unknown> {
  try {
    const o = JSON.parse(raw) as unknown;
    if (o && typeof o === "object" && !Array.isArray(o)) return o as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return {};
}

async function collectNodeLabelKinds(ctx: ReadCtx, nodeId: string): Promise<string[]> {
  const rows = await ctx.db
    .query("node_label_assignments")
    .withIndex("by_node_label", (q) => q.eq("nodeId", nodeId))
    .collect();
  const kinds: string[] = [];
  for (const row of rows) {
    if (row.labelId === undefined) continue;
    const label = await ctx.db
      .query("node_labels")
      .withIndex("by_labelId", (q) => q.eq("labelId", row.labelId))
      .unique();
    if (label) kinds.push(label.kind);
  }
  return sortUnique(kinds);
}

/** Incident edges for search-meta (same namespace as memoryKey). */
async function collectEdgesFromDb(
  ctx: ReadCtx,
  nodeId: string,
  _namespace: string,
): Promise<
  Array<{
    edgeId: string;
    neighborKey: string;
    direction: "in" | "out";
    labelsJoined: string | null;
  }>
> {
  const from = await ctx.db
    .query("edges")
    .withIndex("by_from", (q) => q.eq("fromNodeId", nodeId))
    .collect();
  const to = await ctx.db
    .query("edges")
    .withIndex("by_to", (q) => q.eq("toNodeId", nodeId))
    .collect();
  const seen = new Set<string>();
  const out: Array<{
    edgeId: string;
    neighborKey: string;
    direction: "in" | "out";
    labelsJoined: string | null;
  }> = [];

  for (const e of [...from, ...to]) {
    if (e.fromNodeId === undefined || e.toNodeId === undefined || e.edgeId === undefined) continue;
    const otherId = e.fromNodeId === nodeId ? e.toNodeId : e.fromNodeId;
    const direction: "in" | "out" = e.fromNodeId === nodeId ? "out" : "in";
    const otherNode = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", otherId))
      .unique();
    if (!otherNode) continue;

    const mem = await ctx.db
      .query("memories")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", otherNode.memoryId))
      .unique();
    if (!mem) continue;

    const key = `${e.edgeId}:${direction}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const assignments = await ctx.db
      .query("edge_label_assignments")
      .withIndex("by_edge_label", (q) => q.eq("edgeId", e.edgeId))
      .collect();
    const kinds: string[] = [];
    for (const a of assignments) {
      if (a.labelId === undefined) continue;
      const el = await ctx.db
        .query("edge_labels")
        .withIndex("by_labelId", (q) => q.eq("labelId", a.labelId))
        .unique();
      if (el) kinds.push(el.kind);
    }
    kinds.sort((a, b) => a.localeCompare(b));

    out.push({
      edgeId: e.edgeId,
      neighborKey: mem.key,
      direction,
      labelsJoined: kinds.length ? kinds.join(EDGE_LABEL_SEP) : null,
    });
  }

  out.sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  return out;
}

export async function buildCanonicalMemorySearchMetaText(
  ctx: ReadCtx,
  namespace: string,
  memoryKey: string,
): Promise<string> {
  const memoryId = ids.memory(namespace, memoryKey);
  const mem = await ctx.db
    .query("memories")
    .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", memoryId))
    .unique();
  const kind = mem?.kind ?? "node";
  if (kind === "edge" && mem?.edgeId) {
    const { loadGraphEdge } = await import("./graphReads.js");
    const link = await loadGraphEdge(ctx, namespace, mem.edgeId);
    if (!link) return "";
    const edgeKinds = link.labels.map((l) => l.kind).sort((a, b) => a.localeCompare(b));
    const line = `edge_memory:${link.fromKey}<->${link.toKey}:${edgeKinds.join("|")}`;
    return line;
  }
  const nodeId = ids.node(namespace, memoryKey);
  const labels = await collectNodeLabelKinds(ctx, nodeId);
  const nodeLines = formatNodeLines(labels);
  const edgeRows = await collectEdgesFromDb(ctx, nodeId, namespace);
  const edgeLines = edgeRows.map((r) =>
    formatEdgeLine(r.direction, r.neighborKey, parseEdgeLabelsJoined(r.labelsJoined)),
  );
  const lines = [...nodeLines, ...edgeLines].sort((a, b) => a.localeCompare(b));
  return lines.join("\n");
}

/** Neighboring memories (any primary namespace) linked by an incident edge to `nodeId`. */
export async function listNeighborMemoriesForNode(
  ctx: ReadCtx,
  _namespace: string,
  nodeId: string,
): Promise<{ namespace: string; key: string }[]> {
  const fromEdges = await ctx.db
    .query("edges")
    .withIndex("by_from", (q) => q.eq("fromNodeId", nodeId))
    .collect();
  const toEdges = await ctx.db
    .query("edges")
    .withIndex("by_to", (q) => q.eq("toNodeId", nodeId))
    .collect();
  const out = new Map<string, { namespace: string; key: string }>();
  for (const e of [...fromEdges, ...toEdges]) {
    if (e.fromNodeId === undefined || e.toNodeId === undefined) continue;
    const otherId = e.fromNodeId === nodeId ? e.toNodeId : e.fromNodeId;
    const otherNode = await ctx.db
      .query("nodes")
      .withIndex("by_nodeId", (q) => q.eq("nodeId", otherId))
      .unique();
    if (!otherNode) continue;
    const mem = await ctx.db
      .query("memories")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", otherNode.memoryId))
      .unique();
    if (!mem) continue;
    out.set(mem.memoryId, { namespace: mem.namespace, key: mem.key });
  }
  return [...out.values()].sort((a, b) =>
    a.namespace !== b.namespace
      ? a.namespace.localeCompare(b.namespace)
      : a.key.localeCompare(b.key),
  );
}

export { MEMORY_SEARCH_META_SOURCE_KEY, parsePropsJson };
