import type { Edge, Memory, SourceMap } from "../db/schema";
import { vectorVecTableName } from "../db/search-indexes";
import type { DbCtx } from "./context";
import { ids } from "./ids";

export type NeighborConstraint<EDGE_LABEL extends string = string> = {
  label: EDGE_LABEL;
  direction?: "in" | "out";
};

export type NeighborFilter<EDGE_LABEL extends string = string> = {
  all?: NeighborConstraint<EDGE_LABEL>[];
  some?: NeighborConstraint<EDGE_LABEL>[];
};

export type HydratedSourceMapHit<NODE_LABEL extends string = string> = SourceMap & {
  memory: Memory;
  labels: NODE_LABEL[];
};

export type HydratedNeighbor<EDGE_LABEL extends string = string> = Memory & {
  labels: EDGE_LABEL[];
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

export function searchLexicalSourceMapIds(
  ctx: DbCtx,
  input: { namespace: string; text: string; limit: number },
): string[] {
  if (input.text.length === 0) return [];
  const rows = ctx.db
    .query<{ sourceMapId: string }, [string, string, number]>(
      `SELECT source_map_id AS sourceMapId
       FROM text_features_fts
       WHERE text_features_fts MATCH ?
         AND memory_id IN (SELECT _id FROM memories WHERE namespace = ?)
       ORDER BY bm25(text_features_fts)
       LIMIT ?`,
    )
    .all(input.text, input.namespace, input.limit);
  return rows.map((row) => row.sourceMapId);
}

export function searchVectorSourceMapIds(
  ctx: DbCtx,
  input: { namespace: string; vector: number[]; limit: number },
): string[] {
  const tableName = vectorVecTableName(input.vector.length);
  const exists = ctx.db
    .query<{ name: string }, [string]>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    )
    .get(tableName);
  if (!exists) return [];

  const rows = ctx.db
    .query<{ sourceMapId: string }, [string, number, string]>(
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
       WHERE m.namespace = ?
       ORDER BY knn.distance ASC`,
    )
    .all(JSON.stringify(input.vector), input.limit, input.namespace);
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

export function listNeighborsForMemory<EDGE_LABEL extends string = string>(
  ctx: DbCtx,
  input: {
    namespace: string;
    key: string;
    filters?: NeighborFilter<EDGE_LABEL>;
  },
): HydratedNeighbor<EDGE_LABEL>[] {
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
      labels: EDGE_LABEL[];
    }
  >();

  for (const row of rows) {
    const existing = grouped.get(row.edgeId);
    if (existing) {
      existing.labels.push(row.edgeLabel);
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
      labels: [row.edgeLabel],
    });
  }

  return [...grouped.values()].flatMap((row) => {
    const labels = [...new Set(row.labels)];
    const matches = (constraints: NeighborConstraint<EDGE_LABEL>[] | undefined): EDGE_LABEL[] => {
      if (!constraints || constraints.length === 0) return labels;
      return labels.filter((label) =>
        constraints.some(
          (constraint) =>
            constraint.label === label &&
            (constraint.direction === undefined || constraint.direction === row.direction),
        ),
      );
    };

    const allConstraints = input.filters?.all;
    if (
      allConstraints &&
      !allConstraints.every(
        (constraint) =>
          labels.includes(constraint.label) &&
          (constraint.direction === undefined || constraint.direction === row.direction),
      )
    ) {
      return [];
    }

    const someConstraints = input.filters?.some;
    if (
      someConstraints &&
      someConstraints.length > 0 &&
      !someConstraints.some(
        (constraint) =>
          labels.includes(constraint.label) &&
          (constraint.direction === undefined || constraint.direction === row.direction),
      )
    ) {
      return [];
    }

    const preferredLabel = matches(allConstraints)[0] ?? matches(someConstraints)[0] ?? labels[0];
    if (!preferredLabel) return [];

    return [
      {
        ...row.memory,
        labels,
        edge: {
          ...row.edge,
          label: preferredLabel,
        },
      },
    ];
  });
}
