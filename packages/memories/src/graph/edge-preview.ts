import type { MutationCtx } from "../api/merge-memory";

export type EdgePreviewPayload = {
  edgeId: string;
  fromKey: string;
  toKey: string;
  labels: string[];
  properties: Record<string, unknown> | null;
};

/**
 * Loads ontology labels + JSON properties for one edge, scoped to a namespace.
 */
export function loadEdgePreview(
  ctx: MutationCtx,
  namespace: string,
  edgeId: string,
): EdgePreviewPayload | null {
  const row = ctx.db
    .query<
      {
        edgeId: string;
        fromKey: string;
        toKey: string;
        propertiesJson: string | null;
        labelsJoined: string | null;
      },
      [string, string, string]
    >(
      `SELECT e._id AS edgeId, nf.value AS fromKey, nt.value AS toKey,
              e.properties AS propertiesJson,
              GROUP_CONCAT(el.value, char(31)) AS labelsJoined
       FROM edges e
       JOIN nodes nf ON nf._id = e.from_node_id
       JOIN nodes nt ON nt._id = e.to_node_id
       JOIN memories mf ON mf.namespace = ? AND mf.key = nf.value
       JOIN memories mt ON mt.namespace = ? AND mt.key = nt.value
       LEFT JOIN edge_label_assignments ela ON ela.edge_id = e._id
       LEFT JOIN edge_labels el ON el._id = ela.label_id
       WHERE e._id = ?
       GROUP BY e._id, nf.value, nt.value, e.properties`,
    )
    .get(namespace, namespace, edgeId);

  if (!row) return null;

  const sep = String.fromCharCode(31);
  const labels = row.labelsJoined
    ? [...new Set(row.labelsJoined.split(sep).filter(Boolean))].sort()
    : [];

  let properties: Record<string, unknown> | null = null;
  if (row.propertiesJson) {
    try {
      const parsed: unknown = JSON.parse(row.propertiesJson);
      properties =
        parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
    } catch {
      properties = null;
    }
  }

  return {
    edgeId: row.edgeId,
    fromKey: row.fromKey,
    toKey: row.toKey,
    labels,
    properties,
  };
}
