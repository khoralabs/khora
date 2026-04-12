/** Response shape from `GET /api/graph`. */
export type GraphPayload = {
  namespace: string;
  nodes: Array<{ key: string; x: number; y: number; z: number; labels: string[] }>;
  edges: Array<{
    edgeId: string;
    fromKey: string;
    toKey: string;
    labels: string[];
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
  labels: string[];
};

/** World-space scale for layout coordinates. */
export const SCALE = 2;

/** Graph segment for drawing; directed edges keep API order, undirected merges use sorted keys. */
export type SceneEdge = {
  key: string;
  edgeId: string;
  fromKey: string;
  toKey: string;
  labels: string[];
  /** When true, dash scroll follows `fromKey` → `toKey`. */
  directed?: boolean;
};
