/** Wire shape for ontology label instances (matches `@cfd/memories-core` JSON). */
export type GraphLabelInstance = {
  kind: string;
  props: Record<string, unknown>;
};

/** Response shape from `GET /api/graph`. */
export type GraphPayload = {
  namespace: string;
  nodes: Array<{ key: string; x: number; y: number; z: number; labels: GraphLabelInstance[] }>;
  edges: Array<{
    edgeId: string;
    fromKey: string;
    toKey: string;
    labels: GraphLabelInstance[];
    /** When true, dashes animate from `fromKey` toward `toKey`; omit/false = undirected (static dashes). */
    directed?: boolean;
  }>;
};

/** When set, nodes outside `relevantKeys` are dimmed (search hits ∪ neighbors). */
export type GraphSearchState = {
  relevantKeys: ReadonlySet<string>;
  hitCount: number;
};

/** 3D marker in the projection scene (`[-1, 1]` per axis from layout). */
export type ProjectionPoint = {
  entryId: string;
  key: string;
  x: number;
  y: number;
  z: number;
  labels: GraphLabelInstance[];
};

/** World-space scale for layout coordinates. */
export const SCALE = 2;

/** Graph segment for drawing; directed edges keep API order, undirected merges use sorted keys. */
export type SceneEdge = {
  key: string;
  edgeId: string;
  fromKey: string;
  toKey: string;
  labels: GraphLabelInstance[];
  /** When true, dash scroll follows `fromKey` → `toKey`. */
  directed?: boolean;
};

export function graphLabelFingerprint(l: GraphLabelInstance): string {
  return `${l.kind}\0${JSON.stringify(l.props)}`;
}

export function formatGraphLabelShort(l: GraphLabelInstance): string {
  const keys = Object.keys(l.props);
  if (keys.length === 0) return l.kind;
  return `${l.kind} (${keys.length} props)`;
}
