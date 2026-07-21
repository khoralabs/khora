import type {
  OntologyLabelWire,
  SearchHitWire,
  SearchNeighborHitWire,
} from "@khoralabs/exedra-workflows-shared/memories/search-hit-wire";
import type { SearchHit } from "@khoralabs/memories-node";

const MAX_NEIGHBORS_PER_HIT = 8;

function serializeLabel(label: {
  kind: string;
  props: Record<string, unknown>;
}): OntologyLabelWire {
  return { kind: label.kind, props: label.props ?? {} };
}

export function serializeSearchHit(hit: SearchHit): SearchHitWire {
  const row = hit as SearchHit & { _id: string; memory_id: string; source_key: string };
  const wire: SearchHitWire = {
    id: row._id,
    memoryId: row.memory_id,
    sourceKey: row.source_key,
    score: hit.score,
    memory: {
      namespace: hit.memory.namespace,
      key: hit.memory.key,
      kind: hit.memory.kind,
      ...(hit.memory.edge_id !== undefined ? { edge_id: hit.memory.edge_id } : {}),
    },
    labels: hit.labels.map(serializeLabel),
    graph:
      hit.graph.kind === "node"
        ? { kind: "node" }
        : {
            kind: "edge",
            edge: {
              edgeId: hit.graph.edge.edgeId,
              fromKey: hit.graph.edge.fromKey,
              toKey: hit.graph.edge.toKey,
              labels: hit.graph.edge.labels.map(serializeLabel),
              properties: hit.graph.edge.properties,
              directed: hit.graph.edge.directed,
            },
          },
  };
  if (hit.neighbors !== undefined && hit.neighbors.length > 0) {
    wire.neighbors = hit.neighbors.slice(0, MAX_NEIGHBORS_PER_HIT).map(
      (n): SearchNeighborHitWire => ({
        namespace: n.namespace,
        key: n.key,
        kind: n.kind,
        labels: n.labels.map(serializeLabel),
        edge: {
          from_node_id: n.edge.from_node_id,
          to_node_id: n.edge.to_node_id,
          properties: n.edge.properties,
          label: serializeLabel(n.edge.label),
        },
        ...(n.neighborScore !== undefined ? { neighborScore: n.neighborScore } : {}),
        ...(n.matchedSourceMapId !== undefined ? { matchedSourceMapId: n.matchedSourceMapId } : {}),
      }),
    );
  }
  return wire;
}
