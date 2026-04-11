import type { SQLQueryBindings } from "bun:sqlite";
import { ids, type SearchNamespaceScope } from "@cfd/memories-core";
import type { Edge, Memory, SourceMap } from "../schema";
import { vectorVecTableName } from "../search-indexes";
import type { DbCtx } from "./context";

/** Same semantics as root hit `labels` filter: `all` = AND, `some` = OR (non-empty). Omitted = any. */
export type NeighborNodesFilter<NODE_LABEL extends string = string> = {
  all?: NODE_LABEL[];
  some?: NODE_LABEL[];
};

/** Omitted `direction` matches both incident orientations (in and out). */
export type NeighborConstraint<
  EDGE_LABEL extends string = string,
  NODE_LABEL extends string = string,
> = {
  label: EDGE_LABEL;
  direction?: "in" | "out";
  /** If set, the adjacent memory's node must satisfy these node-label rules. */
  nodes?: NeighborNodesFilter<NODE_LABEL>;
};

export type NeighborFilter<
  EDGE_LABEL extends string = string,
  NODE_LABEL extends string = string,
> = {
  all?: NeighborConstraint<EDGE_LABEL, NODE_LABEL>[];
  some?: NeighborConstraint<EDGE_LABEL, NODE_LABEL>[];
};

export type HydratedSourceMapHit<NODE_LABEL extends string = string> = SourceMap & {
  memory: Memory;
  labels: NODE_LABEL[];
};

export type HydratedNeighbor<
  EDGE_LABEL extends string = string,
  NODE_LABEL extends string = string,
> = Memory & {
  /** Ontology node labels on the neighbor memory's node (same meaning as root hit `labels`). */
  labels: NODE_LABEL[];
  edge: Edge & { label: EDGE_LABEL };
};

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function parseProperties(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function matchesNodeLabelFilter<LABEL extends string>(
  labels: readonly LABEL[],
  filter: NeighborNodesFilter<LABEL> | undefined,
): boolean {
  if (!filter) return true;
  if (filter.all && !filter.all.every((label) => labels.includes(label))) {
    return false;
  }
  if (
    filter.some &&
    filter.some.length > 0 &&
    !filter.some.some((label) => labels.includes(label))
  ) {
    return false;
  }
  return true;
}

function neighborConstraintSatisfied<EDGE_LABEL extends string, NODE_LABEL extends string>(
  constraint: NeighborConstraint<EDGE_LABEL, NODE_LABEL>,
  edgeLabels: readonly EDGE_LABEL[],
  direction: "in" | "out",
  neighborNodeLabels: readonly NODE_LABEL[],
): boolean {
  if (!edgeLabels.includes(constraint.label)) return false;
  if (constraint.direction !== undefined && constraint.direction !== direction) return false;
  return matchesNodeLabelFilter(neighborNodeLabels, constraint.nodes);
}

/**
 * FTS5 MATCH string: AND-combines whitespace-separated tokens as phrase terms (quotes escaped).
 * Stemming/plural alignment comes from the FTS tokenizer (e.g. `porter` in {@link initTextFeaturesFts}), not the query.
 */
export function buildFtsMatchFromUserText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const clauses = tokens.map((raw) => {
    const tok = raw.replace(/"/g, '""');
    /** Phrase OR prefix so e.g. `Archer` can match Porter-stemmed `archery` in the index. */
    if (tok.length >= 3 && /^[\p{L}\p{N}]+$/u.test(raw)) {
      return `("${tok}" OR ${tok}*)`;
    }
    return `"${tok}"`;
  });
  return clauses.join(" AND ");
}

function memoryIdSubqueryFromScope(
  scope: SearchNamespaceScope,
  memoryIds: string[] | undefined,
): { sql: string; bindings: SQLQueryBindings[] } {
  if (scope.kind === "unscoped") {
    if (memoryIds === undefined) {
      return { sql: "memory_id IN (SELECT _id FROM memories)", bindings: [] };
    }
    return {
      sql: `memory_id IN (SELECT _id FROM memories WHERE _id IN (${placeholders(memoryIds.length)}))`,
      bindings: [...memoryIds],
    };
  }
  const ns = scope.namespaces;
  if (ns.length === 0) {
    return { sql: "memory_id IN (SELECT _id FROM memories WHERE 1 = 0)", bindings: [] };
  }
  const inNs = `namespace IN (${placeholders(ns.length)})`;
  if (memoryIds === undefined) {
    return {
      sql: `memory_id IN (SELECT _id FROM memories WHERE ${inNs})`,
      bindings: [...ns],
    };
  }
  return {
    sql: `memory_id IN (SELECT _id FROM memories WHERE ${inNs} AND _id IN (${placeholders(memoryIds.length)}))`,
    bindings: [...ns, ...memoryIds],
  };
}

export function searchLexicalSourceMapIds(
  ctx: DbCtx,
  input: { scope: SearchNamespaceScope; text: string; limit: number; memoryIds?: string[] },
): string[] {
  if (input.text.length === 0) return [];
  if (input.memoryIds !== undefined && input.memoryIds.length === 0) return [];

  const matchExpr = buildFtsMatchFromUserText(input.text);
  if (matchExpr.length === 0) return [];

  const { sql: memFilter, bindings: memBindings } = memoryIdSubqueryFromScope(
    input.scope,
    input.memoryIds,
  );

  const params: SQLQueryBindings[] = [matchExpr, ...memBindings, input.limit];

  const rows = ctx.db
    .query<{ sourceMapId: string }, SQLQueryBindings[]>(
      `SELECT source_map_id AS sourceMapId
       FROM text_features_fts
       WHERE text_features_fts MATCH ?
         AND ${memFilter}
       ORDER BY bm25(text_features_fts)
       LIMIT ?`,
    )
    .all(...params);
  return rows.map((row) => row.sourceMapId);
}

export function searchVectorSourceMapIds(
  ctx: DbCtx,
  input: { scope: SearchNamespaceScope; vector: number[]; limit: number; memoryIds?: string[] },
): string[] {
  if (input.memoryIds !== undefined && input.memoryIds.length === 0) return [];
  if (input.scope.kind === "union" && input.scope.namespaces.length === 0) return [];

  const tableName = vectorVecTableName(input.vector.length);
  const exists = ctx.db
    .query<{ name: string }, [string]>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    )
    .get(tableName);
  if (!exists) return [];

  /** Global vec0 top-k may miss a small allowlist; widen k when scoped. */
  const knnK =
    input.memoryIds !== undefined ? Math.min(Math.max(input.limit * 40, 100), 2048) : input.limit;

  const memFilter =
    input.memoryIds === undefined
      ? ""
      : `AND vf.memory_id IN (${placeholders(input.memoryIds.length)})`;

  const nsClause =
    input.scope.kind === "unscoped"
      ? ""
      : `AND m.namespace IN (${placeholders(input.scope.namespaces.length)})`;

  const nsBindings: SQLQueryBindings[] =
    input.scope.kind === "unscoped" ? [] : [...input.scope.namespaces];

  const params: SQLQueryBindings[] =
    input.memoryIds === undefined
      ? [JSON.stringify(input.vector), knnK, ...nsBindings]
      : [JSON.stringify(input.vector), knnK, ...nsBindings, ...input.memoryIds];

  const rows = ctx.db
    .query<{ sourceMapId: string }, SQLQueryBindings[]>(
      `WITH knn AS (
         SELECT vector_feature_id, distance
         FROM "${tableName.replaceAll('"', '""')}"
         WHERE embedding MATCH ?
           AND k = ?
       )
       SELECT vf.source_map_id AS sourceMapId
       FROM knn
       JOIN vector_features vf ON vf._id = knn.vector_feature_id
       JOIN memories m ON m._id = vf.memory_id
       WHERE 1 = 1
       ${nsClause}
       ${memFilter}
       ORDER BY knn.distance ASC`,
    )
    .all(...params);
  return rows.map((row) => row.sourceMapId);
}

export function hydrateSourceMapHits<NODE_LABEL extends string = string>(
  ctx: DbCtx,
  sourceMapIds: readonly string[],
): HydratedSourceMapHit<NODE_LABEL>[] {
  if (sourceMapIds.length === 0) return [];

  const sourceMapRows = ctx.db
    .query<
      {
        sourceMapId: string;
        sourceMapCreated: number;
        memoryId: string;
        sourceKey: string;
        memoryCreated: number;
        namespace: string;
        key: string;
      },
      string[]
    >(
      `SELECT
         sm._id AS sourceMapId,
         sm._ts_created AS sourceMapCreated,
         sm.memory_id AS memoryId,
         sm.source_key AS sourceKey,
         m._ts_created AS memoryCreated,
         m.namespace AS namespace,
         m.key AS key
       FROM source_maps sm
       JOIN memories m ON m._id = sm.memory_id
       WHERE sm._id IN (${placeholders(sourceMapIds.length)})`,
    )
    .all(...sourceMapIds);

  const bySourceMapId = new Map(
    sourceMapRows.map((row) => [
      row.sourceMapId,
      {
        _id: row.sourceMapId,
        _ts_created: row.sourceMapCreated,
        memory_id: row.memoryId,
        source_key: row.sourceKey,
        memory: {
          _id: row.memoryId,
          _ts_created: row.memoryCreated,
          namespace: row.namespace,
          key: row.key,
        } satisfies Memory,
      },
    ]),
  );

  const nodeIds = [...new Set(sourceMapRows.map((row) => ids.node(row.namespace, row.key)))];
  const labelsByNodeId = new Map<string, NODE_LABEL[]>();
  if (nodeIds.length > 0) {
    const labelRows = ctx.db
      .query<{ nodeId: string; label: NODE_LABEL }, string[]>(
        `SELECT nla.node_id AS nodeId, nl.value AS label
         FROM node_label_assignments nla
         JOIN node_labels nl ON nl._id = nla.label_id
         WHERE nla.node_id IN (${placeholders(nodeIds.length)})
         ORDER BY nl.value ASC`,
      )
      .all(...nodeIds);

    for (const { nodeId, label } of labelRows) {
      const labels = labelsByNodeId.get(nodeId) ?? [];
      labels.push(label);
      labelsByNodeId.set(nodeId, labels);
    }
  }

  return sourceMapIds.flatMap((sourceMapId) => {
    const row = bySourceMapId.get(sourceMapId);
    if (!row) return [];
    const nodeId = ids.node(row.memory.namespace, row.memory.key);
    return [
      {
        _id: row._id,
        _ts_created: row._ts_created,
        memory_id: row.memory_id,
        source_key: row.source_key,
        memory: row.memory,
        labels: labelsByNodeId.get(nodeId) ?? [],
      },
    ];
  });
}

export function listNeighborsForMemory<
  EDGE_LABEL extends string = string,
  NODE_LABEL extends string = string,
>(
  ctx: DbCtx,
  input: {
    namespace: string;
    key: string;
    filters?: NeighborFilter<EDGE_LABEL, NODE_LABEL>;
  },
): HydratedNeighbor<EDGE_LABEL, NODE_LABEL>[] {
  const nodeId = ids.node(input.namespace, input.key);
  const rows = ctx.db
    .query<
      {
        edgeId: string;
        edgeCreated: number;
        fromNodeId: string;
        toNodeId: string;
        edgeProperties: unknown;
        edgeLabel: EDGE_LABEL;
        memoryId: string;
        memoryCreated: number;
        namespace: string;
        key: string;
      },
      [string, string, string, string]
    >(
      `SELECT
         e._id AS edgeId,
         e._ts_created AS edgeCreated,
         e.from_node_id AS fromNodeId,
         e.to_node_id AS toNodeId,
         e.properties AS edgeProperties,
         el.value AS edgeLabel,
         m._id AS memoryId,
         m._ts_created AS memoryCreated,
         m.namespace AS namespace,
         m.key AS key
       FROM edges e
       JOIN edge_label_assignments ela ON ela.edge_id = e._id
       JOIN edge_labels el ON el._id = ela.label_id
       JOIN nodes n ON n._id = CASE
         WHEN e.from_node_id = ? THEN e.to_node_id
         ELSE e.from_node_id
       END
       JOIN memories m ON m.namespace = ? AND m.key = n.value
       WHERE e.from_node_id = ? OR e.to_node_id = ?
       ORDER BY e._id ASC, el.value ASC`,
    )
    .all(nodeId, input.namespace, nodeId, nodeId);

  const grouped = new Map<
    string,
    {
      memory: Memory;
      edge: Edge;
      direction: "in" | "out";
      edgeLabels: EDGE_LABEL[];
    }
  >();

  for (const row of rows) {
    const existing = grouped.get(row.edgeId);
    if (existing) {
      existing.edgeLabels.push(row.edgeLabel);
      continue;
    }
    grouped.set(row.edgeId, {
      memory: {
        _id: row.memoryId,
        _ts_created: row.memoryCreated,
        namespace: row.namespace,
        key: row.key,
      },
      edge: {
        _id: row.edgeId,
        _ts_created: row.edgeCreated,
        from_node_id: row.fromNodeId,
        to_node_id: row.toNodeId,
        properties: parseProperties(row.edgeProperties),
      },
      direction: row.fromNodeId === nodeId ? "out" : "in",
      edgeLabels: [row.edgeLabel],
    });
  }

  const neighborNodeIds = [
    ...new Set([...grouped.values()].map((v) => ids.node(v.memory.namespace, v.memory.key))),
  ];
  const neighborNodeLabelsById = new Map<string, NODE_LABEL[]>();
  if (neighborNodeIds.length > 0) {
    const labelRows = ctx.db
      .query<{ nodeId: string; label: NODE_LABEL }, string[]>(
        `SELECT nla.node_id AS nodeId, nl.value AS label
         FROM node_label_assignments nla
         JOIN node_labels nl ON nl._id = nla.label_id
         WHERE nla.node_id IN (${placeholders(neighborNodeIds.length)})
         ORDER BY nl.value ASC`,
      )
      .all(...neighborNodeIds);
    for (const { nodeId, label } of labelRows) {
      const ls = neighborNodeLabelsById.get(nodeId) ?? [];
      ls.push(label);
      neighborNodeLabelsById.set(nodeId, ls);
    }
  }

  return [...grouped.values()].flatMap((row) => {
    const edgeLabels = [...new Set(row.edgeLabels)];
    const neighborNodeLabels =
      neighborNodeLabelsById.get(ids.node(row.memory.namespace, row.memory.key)) ?? [];

    const matches = (
      constraints: NeighborConstraint<EDGE_LABEL, NODE_LABEL>[] | undefined,
    ): EDGE_LABEL[] => {
      if (!constraints || constraints.length === 0) return edgeLabels;
      return edgeLabels.filter((label) =>
        constraints.some(
          (constraint) =>
            constraint.label === label &&
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
