import type {
  NeighborConstraint,
  NeighborFilter,
  NeighborNodesFilter,
  OntologyLabelInstance,
} from "@khoralabs/memories-core";
import { ids, namespacePath } from "@khoralabs/memories-core";
import type { Edge, Memory } from "@khoralabs/memories-core/persistence";
import type { QueryCtx } from "../_generated/server.js";
import { loadGraphEdge } from "./graphReads.js";
import { parsePropsJson } from "./helpers.js";

export type HydratedNeighborRow = Memory & {
  labels: OntologyLabelInstance[];
  edge: Edge & { label: OntologyLabelInstance };
};

function parseProperties(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
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

function matchesNodeLabelFilter(
  labels: readonly OntologyLabelInstance[],
  filter: NeighborNodesFilter<string> | undefined,
): boolean {
  const kinds = labels.map((l) => l.kind);
  if (!filter) return true;
  if (filter.all && !filter.all.every((label) => kinds.includes(label))) {
    return false;
  }
  if (
    filter.some &&
    filter.some.length > 0 &&
    !filter.some.some((label) => kinds.includes(label))
  ) {
    return false;
  }
  return true;
}

function neighborConstraintSatisfied<EDGE_LABEL extends string, NODE_LABEL extends string>(
  constraint: NeighborConstraint<EDGE_LABEL, NODE_LABEL>,
  edgeLabels: readonly OntologyLabelInstance[],
  direction: "in" | "out",
  neighborNodeLabels: readonly OntologyLabelInstance[],
): boolean {
  const kinds = edgeLabels.map((e) => e.kind);
  if (!kinds.includes(constraint.label as string)) return false;
  if (constraint.direction !== undefined && constraint.direction !== direction) return false;
  return matchesNodeLabelFilter(neighborNodeLabels, constraint.nodes);
}

/**
 * List neighbor memories connected by edges with label assignments (same namespace as focal).
 * Mirrors SQLite `listNeighborsForMemory` in `packages/memories/persistence/sqlite/src/models/search.ts`.
 */
export async function listNeighborsForMemory<
  EDGE_LABEL extends string = string,
  NODE_LABEL extends string = string,
>(
  ctx: QueryCtx,
  input: {
    namespace: string;
    key: string;
    filters?: NeighborFilter<EDGE_LABEL, NODE_LABEL>;
  },
): Promise<HydratedNeighborRow[]> {
  const nodeId = ids.node(input.namespace, input.key);
  const fromEdges = await ctx.db
    .query("edges")
    .withIndex("by_from", (q) => q.eq("fromNodeId", nodeId))
    .collect();
  const toEdges = await ctx.db
    .query("edges")
    .withIndex("by_to", (q) => q.eq("toNodeId", nodeId))
    .collect();

  const seenEdge = new Set<string>();
  const rows: Array<{
    edgeId: string;
    edgeCreated: number;
    fromNodeId: string;
    toNodeId: string;
    edgePropertiesJson: string | undefined;
    edgeKind: string;
    edgeLabelPropsJson: string;
    memoryId: string;
    memoryCreated: number;
    namespace: string;
    key: string;
  }> = [];

  for (const e of [...fromEdges, ...toEdges]) {
    if (e.edgeId === undefined || e.fromNodeId === undefined || e.toNodeId === undefined) continue;
    if (seenEdge.has(e.edgeId)) continue;
    seenEdge.add(e.edgeId);

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

    const assigns = await ctx.db
      .query("edge_label_assignments")
      .withIndex("by_edge_label", (q) => q.eq("edgeId", e.edgeId))
      .collect();
    for (const ela of assigns) {
      const el = await ctx.db
        .query("edge_labels")
        .withIndex("by_labelId", (q) => q.eq("labelId", ela.labelId))
        .unique();
      if (!el) continue;
      rows.push({
        edgeId: e.edgeId,
        edgeCreated: e.tsCreated,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        edgePropertiesJson: e.propertiesJson,
        edgeKind: el.kind,
        edgeLabelPropsJson: ela.propsJson,
        memoryId: mem.memoryId,
        memoryCreated: mem.tsCreated,
        namespace: mem.namespace,
        key: mem.key,
      });
    }
  }

  rows.sort((a, b) => {
    const c = a.edgeId.localeCompare(b.edgeId);
    return c !== 0 ? c : a.edgeKind.localeCompare(b.edgeKind);
  });

  const grouped = new Map<
    string,
    {
      memory: Memory;
      edge: Edge;
      direction: "in" | "out";
      edgeLabels: OntologyLabelInstance[];
    }
  >();

  for (const row of rows) {
    const inst: OntologyLabelInstance = {
      kind: row.edgeKind,
      props: parsePropsColumn(row.edgeLabelPropsJson),
    };
    const existing = grouped.get(row.edgeId);
    if (existing) {
      existing.edgeLabels.push(inst);
      continue;
    }
    grouped.set(row.edgeId, {
      memory: {
        _id: row.memoryId,
        _ts_created: row.memoryCreated,
        namespace: namespacePath(row.namespace),
        key: row.key,
        kind: "node",
      },
      edge: {
        _id: row.edgeId,
        _ts_created: row.edgeCreated,
        from_node_id: row.fromNodeId,
        to_node_id: row.toNodeId,
        properties: parseProperties(row.edgePropertiesJson),
      },
      direction: row.fromNodeId === nodeId ? "out" : "in",
      edgeLabels: [inst],
    });
  }

  const neighborNodeIds = [
    ...new Set([...grouped.values()].map((v) => ids.node(v.memory.namespace, v.memory.key))),
  ];
  const neighborNodeLabelsById = new Map<string, OntologyLabelInstance[]>();
  for (const nid of neighborNodeIds) {
    const nlas = await ctx.db
      .query("node_label_assignments")
      .withIndex("by_node_label", (q) => q.eq("nodeId", nid))
      .collect();
    const ls: OntologyLabelInstance[] = [];
    for (const nla of nlas) {
      const nl = await ctx.db
        .query("node_labels")
        .withIndex("by_labelId", (q) => q.eq("labelId", nla.labelId))
        .unique();
      if (nl) ls.push({ kind: nl.kind, props: parsePropsJson(nla.propsJson) });
    }
    ls.sort((a, b) => a.kind.localeCompare(b.kind));
    neighborNodeLabelsById.set(nid, ls);
  }

  return [...grouped.values()].flatMap((row) => {
    const edgeLabels = row.edgeLabels;
    const neighborNodeLabels =
      neighborNodeLabelsById.get(ids.node(row.memory.namespace, row.memory.key)) ?? [];

    const matches = (
      constraints: NeighborConstraint<EDGE_LABEL, NODE_LABEL>[] | undefined,
    ): OntologyLabelInstance[] => {
      if (!constraints || constraints.length === 0) return edgeLabels;
      return edgeLabels.filter((inst) =>
        constraints.some(
          (constraint) =>
            (constraint.label as string) === inst.kind &&
            neighborConstraintSatisfied(constraint, edgeLabels, row.direction, neighborNodeLabels),
        ),
      );
    };

    const allConstraints = input.filters?.all;
    if (
      allConstraints &&
      !allConstraints.every((constraint) =>
        neighborConstraintSatisfied(constraint, edgeLabels, row.direction, neighborNodeLabels),
      )
    ) {
      return [];
    }

    const someConstraints = input.filters?.some;
    if (
      someConstraints &&
      someConstraints.length > 0 &&
      !someConstraints.some((constraint) =>
        neighborConstraintSatisfied(constraint, edgeLabels, row.direction, neighborNodeLabels),
      )
    ) {
      return [];
    }

    const preferredLabel =
      matches(allConstraints)[0] ?? matches(someConstraints)[0] ?? edgeLabels[0];
    if (!preferredLabel) return [];

    return [
      {
        ...row.memory,
        labels: neighborNodeLabels,
        edge: {
          ...row.edge,
          label: preferredLabel,
        },
      },
    ];
  });
}

/** Endpoint neighbors for one edge id (used when expanding search from an edge memory root). */
export async function listNeighborsForEdgeMemory<
  EDGE_LABEL extends string = string,
  NODE_LABEL extends string = string,
>(
  ctx: QueryCtx,
  input: {
    namespace: string;
    edgeId: string;
    filters?: NeighborFilter<EDGE_LABEL, NODE_LABEL>;
  },
): Promise<HydratedNeighborRow[]> {
  const link = await loadGraphEdge(ctx, input.namespace, input.edgeId);
  if (!link) return [];
  const fromN = await listNeighborsForMemory(ctx, {
    namespace: input.namespace,
    key: link.fromKey,
    ...(input.filters !== undefined ? { filters: input.filters } : {}),
  });
  const toN = await listNeighborsForMemory(ctx, {
    namespace: input.namespace,
    key: link.toKey,
    ...(input.filters !== undefined ? { filters: input.filters } : {}),
  });
  return [
    ...fromN.filter((n) => n.edge._id === input.edgeId),
    ...toN.filter((n) => n.edge._id === input.edgeId),
  ];
}
