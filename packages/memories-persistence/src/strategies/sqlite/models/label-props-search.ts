import type { Database } from "bun:sqlite";
import {
  formatLabelPropsForSearch,
  ids,
  isNonEmptyProps,
  type LabelPropsSearchFormatter,
  parseOntologyLabelValue,
} from "@cfd/memories-core";
import {
  MEMORY_EDGE_LABEL_PROPS_KEY_PREFIX,
  MEMORY_NODE_LABEL_PROPS_KEY_PREFIX,
  memoryEdgeLabelPropsSourceKey,
  memoryNodeLabelPropsSourceKey,
} from "@cfd/memories-core/search-meta-constants";
import { blobToVector } from "../connection";
import { vectorVecTableName } from "../search-indexes";
import type { DbCtx } from "./context";
import { collectEdgesFromDb, parseEdgeLabelsJoined } from "./memory-search-meta";
import { insertSourceMap } from "./source-maps";
import { insertTextFeatureWithFts } from "./text-features";

function deleteVectorRowAndVecIndex(
  db: Database,
  vectorFeatureId: string,
  vectorBlob: Buffer | Uint8Array,
): void {
  const floats = blobToVector(
    vectorBlob instanceof Buffer ? new Uint8Array(vectorBlob) : vectorBlob,
  );
  const dim = floats.length;
  if (dim < 512 || dim > 3072) return;
  const vTable = vectorVecTableName(dim).replaceAll('"', '""');
  db.run(`DELETE FROM "${vTable}" WHERE vector_feature_id = ?`, [vectorFeatureId]);
  db.run(`DELETE FROM vector_features WHERE _id = ?`, [vectorFeatureId]);
}

function deleteSourceMapBySourceKey(ctx: DbCtx, memoryId: string, sourceKey: string): void {
  const { db } = ctx;
  const sourceMapId = ids.sourceMap(memoryId, sourceKey);
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

/** Remove all label-props FTS chunks for a memory before rebuilding. */
export function removeLabelPropsSearchMaps(ctx: DbCtx, memoryId: string): void {
  const rows = ctx.db
    .query<{ source_key: string }, [string, string, string]>(
      `SELECT source_key FROM source_maps WHERE memory_id = ? AND (
         source_key LIKE ? OR source_key LIKE ?
       )`,
    )
    .all(
      memoryId,
      `${MEMORY_NODE_LABEL_PROPS_KEY_PREFIX}%`,
      `${MEMORY_EDGE_LABEL_PROPS_KEY_PREFIX}%`,
    );
  for (const row of rows) {
    deleteSourceMapBySourceKey(ctx, memoryId, row.source_key);
  }
}

/**
 * Rebuild FTS chunks for ontology props on node labels and incident edge labels.
 * Topology meta (`__mem_search_meta__`) is unchanged; call after {@link syncMemorySearchMeta}.
 */
export function syncLabelPropsSearchFeatures(
  ctx: DbCtx,
  input: {
    namespace: string;
    memoryKey: string;
    formatLabelProps?: LabelPropsSearchFormatter;
  },
): void {
  const { namespace, memoryKey, formatLabelProps } = input;
  const memoryId = ids.memory(namespace, memoryKey);
  const nodeId = ids.node(namespace, memoryKey);

  removeLabelPropsSearchMaps(ctx, memoryId);

  const assignmentRows = ctx.db
    .query<{ assignmentId: string; labelValue: string }, [string]>(
      `SELECT nla._id AS assignmentId, nl.value AS labelValue
       FROM node_label_assignments nla
       JOIN node_labels nl ON nl._id = nla.label_id
       WHERE nla.node_id = ?
       ORDER BY nla._id ASC`,
    )
    .all(nodeId);

  for (const row of assignmentRows) {
    const { kind, props } = parseOntologyLabelValue(row.labelValue);
    if (!isNonEmptyProps(props)) continue;
    const text = formatLabelPropsForSearch(kind, "node", props, formatLabelProps);
    if (text.length === 0) continue;

    const sourceKey = memoryNodeLabelPropsSourceKey(row.assignmentId);
    const { sourceMapId } = insertSourceMap(ctx, { memoryId, sourceKey });
    insertTextFeatureWithFts(ctx, { memoryId, sourceMapId, text });
  }

  const edgeRows = collectEdgesFromDb(ctx, nodeId, namespace);
  for (const edge of edgeRows) {
    const labels = parseEdgeLabelsJoined(edge.labelsJoined ?? null);
    const sections: string[] = [];
    for (const enc of labels) {
      const { kind, props } = parseOntologyLabelValue(enc);
      if (!isNonEmptyProps(props)) continue;
      const body = formatLabelPropsForSearch(kind, "edge", props, formatLabelProps);
      if (body.length === 0) continue;
      sections.push(`Edge ${kind} ${edge.direction} toward ${edge.neighborKey}:\n${body}`);
    }
    if (sections.length === 0) continue;

    const text = sections.join("\n\n");
    const sourceKey = memoryEdgeLabelPropsSourceKey(edge.edgeId);
    const { sourceMapId } = insertSourceMap(ctx, { memoryId, sourceKey });
    insertTextFeatureWithFts(ctx, { memoryId, sourceMapId, text });
  }
}
