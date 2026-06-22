const MAX_NEIGHBORS_PER_HIT = 8;

export type OntologyLabelWire = {
  kind: string;
  props: Record<string, unknown>;
};

export type GraphEdgeLinkWire = {
  edgeId: string;
  fromKey: string;
  toKey: string;
  labels: OntologyLabelWire[];
  properties?: Record<string, unknown> | null;
  directed?: boolean;
};

export type MemoryWire = {
  namespace: string;
  key: string;
  kind: "node" | "edge";
  edge_id?: string;
};

export type SearchNeighborHitWire = {
  namespace: string;
  key: string;
  kind: "node" | "edge";
  labels: OntologyLabelWire[];
  edge: {
    from_node_id: string;
    to_node_id: string;
    properties?: Record<string, unknown>;
    label: OntologyLabelWire;
  };
  neighborScore?: number;
  matchedSourceMapId?: string;
};

export type SearchHitWire = {
  id: string;
  memoryId: string;
  sourceKey: string;
  score: number;
  memory: MemoryWire;
  labels: OntologyLabelWire[];
  graph: { kind: "node" } | { kind: "edge"; edge: GraphEdgeLinkWire };
  neighbors?: SearchNeighborHitWire[];
};

export type SearchContentWire =
  | { text: string }
  | { vector: number[] }
  | { text: string; vector: number[] };

export type SearchParamsWire = {
  namespace: string;
  additionalNamespaces?: string[];
  searchEntireDatabase?: true;
  searchScopeMode?: "pathSubtree" | "scopeDag" | "exactScope";
  content: SearchContentWire;
  options?: {
    topK?: number;
    minScore?: number;
    labels?: { all?: string[]; some?: string[] };
    neighbors?: boolean | { all?: unknown[]; some?: unknown[] };
    maxNeighbors?: number;
    arms?: { vector?: number; lexical?: number };
    maxVectorDistance?: number;
  };
  asOfTimestampMs?: number;
};

export type InternalMemoriesAgentSearchRequest = {
  userId: string;
  orgId?: string;
  params: SearchParamsWire;
};

export type InternalMemoriesAgentSearchResponse = {
  hits: SearchHitWire[];
};

export type InternalMemoriesProvenanceHeadResponse = {
  rootHex: string;
};

export function deserializeSearchHit(wire: SearchHitWire): Record<string, unknown> {
  return {
    _id: wire.id,
    memory_id: wire.memoryId,
    source_key: wire.sourceKey,
    score: wire.score,
    memory: {
      namespace: wire.memory.namespace,
      key: wire.memory.key,
      kind: wire.memory.kind,
      ...(wire.memory.edge_id !== undefined ? { edge_id: wire.memory.edge_id } : {}),
    },
    labels: wire.labels.map((l) => ({ kind: l.kind, props: l.props ?? {} })),
    graph:
      wire.graph.kind === "node"
        ? { kind: "node" as const }
        : {
            kind: "edge" as const,
            edge: {
              edgeId: wire.graph.edge.edgeId,
              fromKey: wire.graph.edge.fromKey,
              toKey: wire.graph.edge.toKey,
              labels: wire.graph.edge.labels.map((l) => ({
                kind: l.kind,
                props: l.props ?? {},
              })),
              properties: wire.graph.edge.properties ?? null,
              ...(wire.graph.edge.directed !== undefined
                ? { directed: wire.graph.edge.directed }
                : {}),
            },
          },
    ...(wire.neighbors !== undefined && wire.neighbors.length > 0
      ? {
          neighbors: wire.neighbors.slice(0, MAX_NEIGHBORS_PER_HIT).map((n) => ({
            namespace: n.namespace,
            key: n.key,
            kind: n.kind,
            labels: n.labels.map((l) => ({ kind: l.kind, props: l.props ?? {} })),
            edge: {
              from_node_id: n.edge.from_node_id,
              to_node_id: n.edge.to_node_id,
              properties: n.edge.properties,
              label: { kind: n.edge.label.kind, props: n.edge.label.props ?? {} },
            },
            ...(n.neighborScore !== undefined ? { neighborScore: n.neighborScore } : {}),
            ...(n.matchedSourceMapId !== undefined
              ? { matchedSourceMapId: n.matchedSourceMapId }
              : {}),
          })),
        }
      : {}),
  };
}

export function deserializeSearchHits(wires: SearchHitWire[]): Record<string, unknown>[] {
  return wires.map(deserializeSearchHit);
}
