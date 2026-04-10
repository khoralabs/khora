import type { Database } from "bun:sqlite";
import { vectorVecTableName } from "../db/search-indexes";
import { blobToVector } from "../sqlite";
import type { DbCtx } from "./context";
import { ids } from "./ids";
import { insertSourceMap } from "./source-maps";
import { insertTextFeatureWithFts } from "./text-features";
import { insertVectorFeatureWithVecIndex } from "./vector-features";

/** Reserved `source_key` for the synthetic ontology / topology search chunk (FTS + optional vec). */
export const MEMORY_SEARCH_META_SOURCE_KEY = "__mem_search_meta__" as const;

const EDGE_LABEL_SEP = String.fromCharCode(31);

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

/** Build the same canonical multiline string as {@link buildCanonicalMemorySearchMetaText} from merge payload (pre-DB). */
export function buildCanonicalMemorySearchMetaTextForMerge(input: {
  labels: string[];
  edges: Array<{ memory_key: string; direction: "in" | "out"; label: string }>;
}): string {
  const nodeLines = formatNodeLines(input.labels);
  const edgeLines = sortUnique(
    input.edges.map((e) => formatEdgeLine(e.direction, e.memory_key, [e.label])),
  );
  const lines = [...nodeLines, ...edgeLines].sort((a, b) => a.localeCompare(b));
  return lines.join("\n");
}

/**
 * Neighbor memory keys linked by an edge to this node (same namespace), for invalidation sets.
 */
export function listNeighborMemoryKeysForNode(
  ctx: DbCtx,
  namespace: string,
  nodeId: string,
): string[] {
  const rows = ctx.db
    .query<{ key: string }, [string, string]>(
      `SELECT DISTINCT m.key AS key
       FROM edges e
       JOIN nodes n_other ON n_other._id = CASE
         WHEN e.from_node_id = ?1 THEN e.to_node_id
         ELSE e.from_node_id
       END
       JOIN memories m ON m.key = n_other.value AND m.namespace = ?2
       WHERE e.from_node_id = ?1 OR e.to_node_id = ?1`,
    )
    .all(nodeId, namespace);
  return sortUnique(rows.map((r) => r.key));
}

function parseEdgeLabelsJoined(s: string | null): string[] {
  if (!s) return [];
  return sortUnique(s.split(EDGE_LABEL_SEP).filter(Boolean));
}

function collectEdgesFromDb(
  ctx: DbCtx,
  nodeId: string,
  namespace: string,
): Array<{
  edgeId: string;
  neighborKey: string;
  direction: "in" | "out";
  labelsJoined: string | null;
}> {
  return ctx.db
    .query<
      { edgeId: string; neighborKey: string; direction: string; labelsJoined: string | null },
      [string, string]
    >(
      `SELECT
         e._id AS edgeId,
         n_other.value AS neighborKey,
         CASE WHEN e.from_node_id = ?1 THEN 'out' ELSE 'in' END AS direction,
         GROUP_CONCAT(el.value, CHAR(31)) AS labelsJoined
       FROM edges e
       JOIN nodes n_other ON n_other._id = CASE
         WHEN e.from_node_id = ?1 THEN e.to_node_id
         ELSE e.from_node_id
       END
       JOIN memories m ON m.key = n_other.value AND m.namespace = ?2
       LEFT JOIN edge_label_assignments ela ON ela.edge_id = e._id
       LEFT JOIN edge_labels el ON el._id = ela.label_id
       WHERE e.from_node_id = ?1 OR e.to_node_id = ?1
       GROUP BY e._id, n_other.value, CASE WHEN e.from_node_id = ?1 THEN 'out' ELSE 'in' END
       ORDER BY e._id ASC`,
    )
    .all(nodeId, namespace)
    .map((r) => ({
      edgeId: r.edgeId,
      neighborKey: r.neighborKey,
      direction: r.direction === "out" ? ("out" as const) : ("in" as const),
      labelsJoined: r.labelsJoined,
    }));
}

function collectNodeLabelsFromDb(ctx: DbCtx, nodeId: string): string[] {
  const rows = ctx.db
    .query<{ label: string }, [string]>(
      `SELECT nl.value AS label
       FROM node_label_assignments nla
       JOIN node_labels nl ON nl._id = nla.label_id
       WHERE nla.node_id = ?
       ORDER BY nl.value ASC`,
    )
    .all(nodeId);
  return rows.map((r) => r.label);
}

/** Canonical multiline text derived from graph tables (node labels + incident edges). */
export function buildCanonicalMemorySearchMetaText(
  ctx: DbCtx,
  namespace: string,
  memoryKey: string,
): string {
  const nodeId = ids.node(namespace, memoryKey);
  const labels = collectNodeLabelsFromDb(ctx, nodeId);
  const nodeLines = formatNodeLines(labels);
  const edgeRows = collectEdgesFromDb(ctx, nodeId, namespace);
  const edgeLines = edgeRows.map((r) =>
    formatEdgeLine(r.direction, r.neighborKey, parseEdgeLabelsJoined(r.labelsJoined)),
  );
  const lines = [...nodeLines, ...edgeLines].sort((a, b) => a.localeCompare(b));
  return lines.join("\n");
}

function deleteVectorRowAndVecIndex(
  db: Database,
  vectorFeatureId: string,
  vectorBlob: Buffer | Uint8Array,
) {
  const floats = blobToVector(
    vectorBlob instanceof Buffer ? new Uint8Array(vectorBlob) : vectorBlob,
  );
  const dim = floats.length;
  if (dim < 512 || dim > 3072) return;
  const vTable = vectorVecTableName(dim).replaceAll('"', '""');
  db.run(`DELETE FROM "${vTable}" WHERE vector_feature_id = ?`, [vectorFeatureId]);
  db.run(`DELETE FROM vector_features WHERE _id = ?`, [vectorFeatureId]);
}

/** Remove synthetic search-meta chunk for a memory if present. */
export function removeMemorySearchMeta(ctx: DbCtx, memoryId: string): void {
  const { db } = ctx;
  const sourceMapId = ids.sourceMap(memoryId, MEMORY_SEARCH_META_SOURCE_KEY);
  const sm = db
    .query<{ _id: string }, [string]>(`SELECT _id FROM source_maps WHERE _id = ?`)
    .get(sourceMapId);
  if (!sm) return;

  const textFeatureId = ids.textFeature(sourceMapId);
  db.run(`DELETE FROM text_features_fts WHERE text_feature_id = ?`, [textFeatureId]);
  db.run(`DELETE FROM text_features_fts WHERE source_map_id = ?`, [sourceMapId]);
  db.run(`DELETE FROM text_features WHERE source_map_id = ?`, [sourceMapId]);

  const vfRows = db
    .query<{ _id: string; vector: Buffer | Uint8Array }, [string]>(
      `SELECT _id, vector FROM vector_features WHERE source_map_id = ?`,
    )
    .all(sourceMapId);
  for (const row of vfRows) {
    deleteVectorRowAndVecIndex(db, row._id, row.vector);
  }

  db.run(`DELETE FROM source_maps WHERE _id = ?`, [sourceMapId]);
}

/**
 * Rebuild lexical (+ optional vector) search meta from current graph state.
 * @param metaVector - only pass for the primary merged memory when the host pre-embedded {@link buildCanonicalMemorySearchMetaTextForMerge} / DB-equivalent text.
 */
export function syncMemorySearchMeta(
  ctx: DbCtx,
  input: {
    namespace: string;
    memoryKey: string;
    metaVector?: Float32Array;
  },
): void {
  const memoryId = ids.memory(input.namespace, input.memoryKey);
  const text = buildCanonicalMemorySearchMetaText(ctx, input.namespace, input.memoryKey);
  removeMemorySearchMeta(ctx, memoryId);
  if (text.length === 0) return;

  const { sourceMapId } = insertSourceMap(ctx, {
    memoryId,
    sourceKey: MEMORY_SEARCH_META_SOURCE_KEY,
  });
  insertTextFeatureWithFts(ctx, { memoryId, sourceMapId, text });
  if (input.metaVector !== undefined && input.metaVector.length > 0) {
    insertVectorFeatureWithVecIndex(ctx, {
      memoryId,
      sourceMapId,
      vector: input.metaVector,
    });
  }
}

/** True if this source key is system-reserved (UMAP exclusion, etc.). */
export function isSystemSearchMetaSourceKey(sourceKey: string): boolean {
  return sourceKey === MEMORY_SEARCH_META_SOURCE_KEY || sourceKey.startsWith("__");
}
