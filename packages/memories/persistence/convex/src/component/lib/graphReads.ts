import type { GraphEdgeLink, GraphNode, OntologyLabelInstance } from "@cfd/memories-core";
import { ids } from "@cfd/memories-core";
import type { QueryCtx } from "../_generated/server.js";
import { parsePropsJson } from "./helpers.js";

function parseEdgeRowProperties(json: string | null | undefined): Record<string, unknown> | null {
  if (json == null || json === "") return null;
  try {
    const p: unknown = JSON.parse(json);
    if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return null;
}

function directedFromEdgePropertiesJson(json: string | null | undefined): boolean {
  if (!json) return false;
  try {
    const p: unknown = JSON.parse(json);
    if (p && typeof p === "object" && !Array.isArray(p)) {
      return (p as { directed?: unknown }).directed === true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function finishGraphEdgeLink(
  edgeId: string,
  fromKey: string,
  toKey: string,
  labels: OntologyLabelInstance[],
  propertiesJson: string | null | undefined,
): GraphEdgeLink {
  const link: GraphEdgeLink = {
    edgeId,
    fromKey,
    toKey,
    labels,
  };
  const props = parseEdgeRowProperties(propertiesJson);
  if (props !== null) link.properties = props;
  if (directedFromEdgePropertiesJson(propertiesJson)) link.directed = true;
  return link;
}

async function edgeToGraphEdgeLink(
  ctx: QueryCtx,
  namespace: string,
  e: {
    edgeId: string;
    fromNodeId: string;
    toNodeId: string;
    propertiesJson?: string;
  },
): Promise<GraphEdgeLink | null> {
  const fromNode = await ctx.db
    .query("nodes")
    .withIndex("by_nodeId", (q) => q.eq("nodeId", e.fromNodeId))
    .unique();
  const toNode = await ctx.db
    .query("nodes")
    .withIndex("by_nodeId", (q) => q.eq("nodeId", e.toNodeId))
    .unique();
  if (!fromNode || !toNode) return null;
  const mf = await ctx.db
    .query("memories")
    .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", fromNode.memoryId))
    .unique();
  const mt = await ctx.db
    .query("memories")
    .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", toNode.memoryId))
    .unique();
  if (!mf || !mt || mf.namespace !== namespace || mt.namespace !== namespace) return null;

  const assignments = await ctx.db
    .query("edge_label_assignments")
    .withIndex("by_edge_label", (q) => q.eq("edgeId", e.edgeId))
    .collect();
  const labels: OntologyLabelInstance[] = [];
  for (const a of assignments) {
    const el = await ctx.db
      .query("edge_labels")
      .withIndex("by_labelId", (q) => q.eq("labelId", a.labelId))
      .unique();
    if (el) labels.push({ kind: el.kind, props: parsePropsJson(a.propsJson) });
  }
  labels.sort((a, b) => a.kind.localeCompare(b.kind));
  return finishGraphEdgeLink(
    e.edgeId,
    fromNode.value,
    toNode.value,
    labels,
    e.propertiesJson ?? null,
  );
}

export async function loadGraphEdgesForNamespace(
  ctx: QueryCtx,
  namespace: string,
): Promise<GraphEdgeLink[]> {
  const rows = await ctx.db
    .query("edges")
    .withIndex("by_namespace", (q) => q.eq("namespace", namespace))
    .collect();
  rows.sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  const out: GraphEdgeLink[] = [];
  for (const e of rows) {
    const link = await edgeToGraphEdgeLink(ctx, namespace, e);
    if (link) out.push(link);
  }
  return out;
}

export async function listIncidentGraphEdges(
  ctx: QueryCtx,
  namespace: string,
  memoryKey: string,
): Promise<GraphEdgeLink[]> {
  const all = await loadGraphEdgesForNamespace(ctx, namespace);
  return all.filter((l) => l.fromKey === memoryKey || l.toKey === memoryKey);
}

export async function loadGraphEdge(
  ctx: QueryCtx,
  namespace: string,
  edgeId: string,
): Promise<GraphEdgeLink | null> {
  const e = await ctx.db
    .query("edges")
    .withIndex("by_edgeId", (q) => q.eq("edgeId", edgeId))
    .unique();
  if (!e || e.namespace !== namespace) return null;
  return edgeToGraphEdgeLink(ctx, namespace, e);
}

export async function loadNodeLabelsForMemory(
  ctx: QueryCtx,
  namespace: string,
  memoryKey: string,
): Promise<OntologyLabelInstance[]> {
  const nodeId = ids.node(namespace, memoryKey);
  const rows = await ctx.db
    .query("node_label_assignments")
    .withIndex("by_node_label", (q) => q.eq("nodeId", nodeId))
    .collect();
  const labels: OntologyLabelInstance[] = [];
  for (const nla of rows) {
    const nl = await ctx.db
      .query("node_labels")
      .withIndex("by_labelId", (q) => q.eq("labelId", nla.labelId))
      .unique();
    if (nl) labels.push({ kind: nl.kind, props: parsePropsJson(nla.propsJson) });
  }
  labels.sort((a, b) => a.kind.localeCompare(b.kind));
  return labels;
}

export async function loadNodePropertiesForMemory(
  ctx: QueryCtx,
  namespace: string,
  memoryKey: string,
): Promise<Record<string, unknown> | null> {
  const row = await ctx.db
    .query("memories")
    .withIndex("by_namespace_key", (q) => q.eq("namespace", namespace).eq("key", memoryKey))
    .unique();
  if (!row) return null;
  const node = await ctx.db
    .query("nodes")
    .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", row.memoryId))
    .unique();
  if (!node?.propertiesJson) return null;
  try {
    const parsed: unknown = JSON.parse(node.propertiesJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function loadGraphNode(
  ctx: QueryCtx,
  namespace: string,
  memoryKey: string,
): Promise<GraphNode | null> {
  const mem = await ctx.db
    .query("memories")
    .withIndex("by_namespace_key", (q) => q.eq("namespace", namespace).eq("key", memoryKey))
    .unique();
  if (!mem) return null;
  const nodeId = ids.node(namespace, memoryKey);
  const labels = await loadNodeLabelsForMemory(ctx, namespace, memoryKey);
  const properties = await loadNodePropertiesForMemory(ctx, namespace, memoryKey);
  return {
    namespace,
    memoryKey,
    nodeId,
    labels,
    properties,
  };
}

export type NodeLabelsEntry = { memoryKey: string; labels: OntologyLabelInstance[] };

export async function loadNodeLabelsForNamespaceEntries(
  ctx: QueryCtx,
  namespace: string,
): Promise<NodeLabelsEntry[]> {
  const mems = await ctx.db
    .query("memories")
    .withIndex("by_namespace_key", (q) => q.eq("namespace", namespace))
    .collect();
  const entries: NodeLabelsEntry[] = mems.map((m) => ({ memoryKey: m.key, labels: [] }));
  const byKey = new Map(entries.map((e) => [e.memoryKey, e] as const));
  for (const m of mems) {
    const nodeId = ids.node(namespace, m.key);
    const rows = await ctx.db
      .query("node_label_assignments")
      .withIndex("by_node_label", (q) => q.eq("nodeId", nodeId))
      .collect();
    const entry = byKey.get(m.key);
    if (!entry) continue;
    for (const nla of rows) {
      const nl = await ctx.db
        .query("node_labels")
        .withIndex("by_labelId", (q) => q.eq("labelId", nla.labelId))
        .unique();
      if (nl) entry.labels.push({ kind: nl.kind, props: parsePropsJson(nla.propsJson) });
    }
    entry.labels.sort((a, b) => a.kind.localeCompare(b.kind));
  }
  return entries;
}

export type NodePropertiesEntry = {
  memoryKey: string;
  properties: Record<string, unknown> | null;
};

export async function loadNodePropertiesForNamespaceEntries(
  ctx: QueryCtx,
  namespace: string,
): Promise<NodePropertiesEntry[]> {
  const mems = await ctx.db
    .query("memories")
    .withIndex("by_namespace_key", (q) => q.eq("namespace", namespace))
    .collect();
  const entries: NodePropertiesEntry[] = mems.map((m) => ({ memoryKey: m.key, properties: null }));
  const byKey = new Map(entries.map((e) => [e.memoryKey, e] as const));
  for (const m of mems) {
    const node = await ctx.db
      .query("nodes")
      .withIndex("by_memoryId_tsCreated", (q) => q.eq("memoryId", m.memoryId))
      .unique();
    const entry = byKey.get(m.key);
    if (!entry || !node?.propertiesJson) continue;
    try {
      const parsed: unknown = JSON.parse(node.propertiesJson);
      entry.properties =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
    } catch {
      entry.properties = null;
    }
  }
  return entries;
}
