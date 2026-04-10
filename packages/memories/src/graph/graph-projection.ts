import { blobToVector } from "../sqlite";
import type { MutationCtx } from "../api/merge-memory";
import { ids } from "../models/ids";

export type GraphEdgeLink = {
  edgeId: string;
  fromKey: string;
  toKey: string;
  labels: string[];
};

export type GraphMemoryEmbedding = {
  memoryKey: string;
  memoryId: string;
  embedding: number[];
};

/**
 * Undirected edge list for a namespace: structural relatedness between memories.
 */
export function loadGraphEdgesForNamespace(
  ctx: MutationCtx,
  namespace: string,
): GraphEdgeLink[] {
  const rows = ctx.db
    .query<
      { edgeId: string; fromKey: string; toKey: string; labelsJoined: string | null },
      [string, string]
    >(
      `SELECT e._id AS edgeId, nf.value AS fromKey, nt.value AS toKey,
              GROUP_CONCAT(el.value, char(31)) AS labelsJoined
       FROM edges e
       JOIN nodes nf ON nf._id = e.from_node_id
       JOIN nodes nt ON nt._id = e.to_node_id
       JOIN memories mf ON mf.namespace = ? AND mf.key = nf.value
       JOIN memories mt ON mt.namespace = ? AND mt.key = nt.value
       LEFT JOIN edge_label_assignments ela ON ela.edge_id = e._id
       LEFT JOIN edge_labels el ON el._id = ela.label_id
       GROUP BY e._id, nf.value, nt.value`,
    )
    .all(namespace, namespace);

  const sep = String.fromCharCode(31);
  const parseJoined = (s: string | null): string[] =>
    s ? [...new Set(s.split(sep).filter(Boolean))].sort() : [];

  const seen = new Set<string>();
  const out: GraphEdgeLink[] = [];
  for (const r of rows) {
    const a = r.fromKey < r.toKey ? r.fromKey : r.toKey;
    const b = r.fromKey < r.toKey ? r.toKey : r.fromKey;
    const dedupe = `${a}\0${b}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      edgeId: r.edgeId,
      fromKey: r.fromKey,
      toKey: r.toKey,
      labels: parseJoined(r.labelsJoined),
    });
  }
  return out;
}

/** Ontology node labels per memory key in a namespace (stable order). */
export function loadNodeLabelsForNamespace(
  ctx: MutationCtx,
  namespace: string,
): Map<string, string[]> {
  const keys = ctx.db
    .query<{ key: string }, [string]>(`SELECT key FROM memories WHERE namespace = ?`)
    .all(namespace);
  if (keys.length === 0) return new Map();
  const nodeIds = keys.map((k) => ids.node(namespace, k.key));
  const ph = nodeIds.map(() => "?").join(",");
  const rows = ctx.db
    .query<{ memoryKey: string; label: string }, string[]>(
      `SELECT n.value AS memoryKey, nl.value AS label
       FROM node_label_assignments nla
       JOIN node_labels nl ON nl._id = nla.label_id
       JOIN nodes n ON n._id = nla.node_id
       WHERE nla.node_id IN (${ph})`,
    )
    .all(...nodeIds);

  const map = new Map<string, string[]>();
  for (const { key } of keys) {
    map.set(key, []);
  }
  for (const r of rows) {
    const arr = map.get(r.memoryKey);
    if (arr) arr.push(r.label);
  }
  for (const k of [...map.keys()]) {
    const arr = map.get(k);
    if (arr) map.set(k, [...new Set(arr)].sort());
  }
  return map;
}

/**
 * Mean-pooled embedding per memory (only memories with at least one vector row).
 * If a memory has vectors of mixed dimensions, only the first dimension seen is kept for that memory
 * (remaining chunks skipped with a debug note in code path — rare).
 */
export function loadMeanEmbeddingsForNamespace(
  ctx: MutationCtx,
  namespace: string,
): GraphMemoryEmbedding[] {
  const rows = ctx.db
    .query<{ memory_id: string; key: string; vector: Buffer | Uint8Array }, [string]>(
      `SELECT vf.memory_id AS memory_id, m.key AS key, vf.vector AS vector
       FROM vector_features vf
       JOIN memories m ON m._id = vf.memory_id
       WHERE m.namespace = ?`,
    )
    .all(namespace);

  const byMemory = new Map<
    string,
    { key: string; sums: number[]; count: number; dim: number }
  >();

  for (const r of rows) {
    const floats = blobToVector(r.vector instanceof Buffer ? new Uint8Array(r.vector) : r.vector);
    const arr = Array.from(floats);
    const dim = arr.length;
    let agg = byMemory.get(r.memory_id);
    if (!agg) {
      agg = { key: r.key, sums: new Array(dim).fill(0), count: 0, dim };
      byMemory.set(r.memory_id, agg);
    }
    if (agg.dim !== dim) continue;
    for (let i = 0; i < dim; i++) {
      const v = arr[i];
      if (v === undefined) continue;
      agg.sums[i] = (agg.sums[i] ?? 0) + v;
    }
    agg.count += 1;
  }

  const out: GraphMemoryEmbedding[] = [];
  for (const [memoryId, agg] of byMemory) {
    if (agg.count === 0) continue;
    const embedding = agg.sums.map((s) => s / agg.count);
    out.push({
      memoryKey: agg.key,
      memoryId,
      embedding,
    });
  }

  return out;
}
