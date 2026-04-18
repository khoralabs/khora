import type { Database } from "bun:sqlite";
import type {
  GraphEdgeLink,
  GraphMemoryEmbedding,
  OntologyLabelInstance,
} from "@cfd/memories-core";
import { ids } from "@cfd/memories-core";
import { blobToVector } from "../connection";

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

function directedFromEdgePropertiesJson(json: string | null): boolean {
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

export function loadGraphEdgesForNamespace(db: Database, namespace: string): GraphEdgeLink[] {
  const rows = db
    .query<
      {
        edgeId: string;
        fromKey: string;
        toKey: string;
        propertiesJson: string | null;
        kind: string | null;
        propsJson: string | null;
      },
      [string, string]
    >(
      `SELECT e._id AS edgeId, nf.value AS fromKey, nt.value AS toKey,
              e.properties AS propertiesJson,
              el.kind AS kind,
              ela.props AS propsJson
       FROM edges e
       JOIN nodes nf ON nf._id = e.from_node_id
       JOIN nodes nt ON nt._id = e.to_node_id
       JOIN memories mf ON mf.namespace = ? AND mf.key = nf.value
       JOIN memories mt ON mt.namespace = ? AND mt.key = nt.value
       LEFT JOIN edge_label_assignments ela ON ela.edge_id = e._id
       LEFT JOIN edge_labels el ON el._id = ela.label_id
       ORDER BY e._id ASC, el.kind ASC`,
    )
    .all(namespace, namespace);

  const byEdge = new Map<
    string,
    {
      fromKey: string;
      toKey: string;
      propertiesJson: string | null;
      labels: OntologyLabelInstance[];
    }
  >();

  for (const r of rows) {
    const existing = byEdge.get(r.edgeId);
    const label =
      r.kind != null
        ? ({ kind: r.kind, props: parsePropsColumn(r.propsJson) } satisfies OntologyLabelInstance)
        : null;
    if (existing) {
      if (label) existing.labels.push(label);
      continue;
    }
    byEdge.set(r.edgeId, {
      fromKey: r.fromKey,
      toKey: r.toKey,
      propertiesJson: r.propertiesJson,
      labels: label ? [label] : [],
    });
  }

  const out: GraphEdgeLink[] = [];
  for (const [edgeId, v] of byEdge) {
    const link: GraphEdgeLink = {
      edgeId,
      fromKey: v.fromKey,
      toKey: v.toKey,
      labels: v.labels,
    };
    if (directedFromEdgePropertiesJson(v.propertiesJson)) {
      link.directed = true;
    }
    out.push(link);
  }
  return out;
}

export function loadNodePropertiesForNamespace(
  db: Database,
  namespace: string,
): Map<string, Record<string, unknown> | null> {
  const keys = db
    .query<{ key: string }, [string]>(`SELECT key FROM memories WHERE namespace = ?`)
    .all(namespace);
  const map = new Map<string, Record<string, unknown> | null>();
  for (const { key } of keys) {
    map.set(key, null);
  }
  if (keys.length === 0) return map;

  const rows = db
    .query<{ memoryKey: string; propertiesJson: string | null }, [string]>(
      `SELECT m.key AS memoryKey, n.properties AS propertiesJson
       FROM memories m
       LEFT JOIN nodes n ON n.value = m.key
       WHERE m.namespace = ?`,
    )
    .all(namespace);

  for (const r of rows) {
    if (!r.propertiesJson) {
      map.set(r.memoryKey, null);
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(r.propertiesJson);
      map.set(
        r.memoryKey,
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null,
      );
    } catch {
      map.set(r.memoryKey, null);
    }
  }
  return map;
}

export function loadNodeLabelsForNamespace(
  db: Database,
  namespace: string,
): Map<string, OntologyLabelInstance[]> {
  const keys = db
    .query<{ key: string }, [string]>(`SELECT key FROM memories WHERE namespace = ?`)
    .all(namespace);
  if (keys.length === 0) return new Map();
  const nodeIds = keys.map((k) => ids.node(namespace, k.key));
  const ph = nodeIds.map(() => "?").join(",");
  const rows = db
    .query<{ memoryKey: string; kind: string; propsJson: string | null }, string[]>(
      `SELECT n.value AS memoryKey, nl.kind AS kind, nla.props AS propsJson
       FROM node_label_assignments nla
       JOIN node_labels nl ON nl._id = nla.label_id
       JOIN nodes n ON n._id = nla.node_id
       WHERE nla.node_id IN (${ph})`,
    )
    .all(...nodeIds);

  const map = new Map<string, OntologyLabelInstance[]>();
  for (const { key } of keys) {
    map.set(key, []);
  }
  for (const r of rows) {
    const arr = map.get(r.memoryKey);
    if (arr) {
      arr.push({ kind: r.kind, props: parsePropsColumn(r.propsJson) });
    }
  }
  for (const k of [...map.keys()]) {
    const arr = map.get(k);
    if (arr && arr.length > 0) {
      arr.sort((a, b) => a.kind.localeCompare(b.kind));
    }
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
