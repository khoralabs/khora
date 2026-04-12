import type { Database } from "bun:sqlite";
import type { GraphEdgeLink, GraphMemoryEmbedding } from "@cfd/memories-core";
import { ids } from "@cfd/memories-core";
import { blobToVector } from "../connection";

export function loadGraphEdgesForNamespace(db: Database, namespace: string): GraphEdgeLink[] {
  const rows = db
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

  const out: GraphEdgeLink[] = [];
  for (const r of rows) {
    out.push({
      edgeId: r.edgeId,
      fromKey: r.fromKey,
      toKey: r.toKey,
      labels: parseJoined(r.labelsJoined),
      directed: true,
    });
  }
  return out;
}

export function loadNodeLabelsForNamespace(db: Database, namespace: string): Map<string, string[]> {
  const keys = db
    .query<{ key: string }, [string]>(`SELECT key FROM memories WHERE namespace = ?`)
    .all(namespace);
  if (keys.length === 0) return new Map();
  const nodeIds = keys.map((k) => ids.node(namespace, k.key));
  const ph = nodeIds.map(() => "?").join(",");
  const rows = db
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

export function loadMeanEmbeddingsForNamespace(
  db: Database,
  namespace: string,
): GraphMemoryEmbedding[] {
  const rows = db
    .query<{ memory_id: string; key: string; vector: Buffer | Uint8Array }, [string]>(
      `SELECT vf.memory_id AS memory_id, m.key AS key, vf.vector AS vector
       FROM vector_features vf
       JOIN source_maps sm ON sm._id = vf.source_map_id
       JOIN memories m ON m._id = vf.memory_id
       WHERE m.namespace = ?
         AND sm.source_key NOT GLOB '__*'`,
    )
    .all(namespace);

  const byMemory = new Map<string, { key: string; sums: number[]; count: number; dim: number }>();

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
