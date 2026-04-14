import type { Database } from "bun:sqlite";
import type { EdgePreviewPayload, OntologyLabelInstance } from "@cfd/memories-core";

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

export function loadEdgePreview(
  db: Database,
  namespace: string,
  edgeId: string,
): EdgePreviewPayload | null {
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
      [string, string, string]
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
       WHERE e._id = ?
       ORDER BY el.kind ASC`,
    )
    .all(namespace, namespace, edgeId);

  if (rows.length === 0) return null;

  const first = rows[0];
  if (!first) return null;

  const labels: OntologyLabelInstance[] = [];
  for (const row of rows) {
    if (row.kind != null) {
      labels.push({ kind: row.kind, props: parsePropsColumn(row.propsJson) });
    }
  }

  let properties: Record<string, unknown> | null = null;
  if (first.propertiesJson) {
    try {
      const parsed: unknown = JSON.parse(first.propertiesJson);
      properties =
        parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
    } catch {
      properties = null;
    }
  }

  return {
    edgeId: first.edgeId,
    fromKey: first.fromKey,
    toKey: first.toKey,
    labels,
    properties,
  };
}
