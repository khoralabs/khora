import type { Edge, Memory, SourceMap } from "../db/rows";

/** Same semantics as root hit `labels` filter: `all` = AND, `some` = OR (non-empty). Omitted = any. */
export type NeighborNodesFilter<NODE_LABEL extends string = string> = {
  all?: NODE_LABEL[];
  some?: NODE_LABEL[];
};

/** Omitted `direction` matches both incident orientations (in and out). */
export type NeighborConstraint<
  EDGE_LABEL extends string = string,
  NODE_LABEL extends string = string,
> = {
  label: EDGE_LABEL;
  direction?: "in" | "out";
  /** If set, the adjacent memory's node must satisfy these node-label rules. */
  nodes?: NeighborNodesFilter<NODE_LABEL>;
};

export type NeighborFilter<
  EDGE_LABEL extends string = string,
  NODE_LABEL extends string = string,
> = {
  all?: NeighborConstraint<EDGE_LABEL, NODE_LABEL>[];
  some?: NeighborConstraint<EDGE_LABEL, NODE_LABEL>[];
};

export type HydratedSourceMapHit<NODE_LABEL extends string = string> = SourceMap & {
  memory: Memory;
  labels: NODE_LABEL[];
};

export type HydratedNeighbor<
  EDGE_LABEL extends string = string,
  NODE_LABEL extends string = string,
> = Memory & {
  /** Ontology node labels on the neighbor memory's node (same meaning as root hit `labels`). */
  labels: NODE_LABEL[];
  edge: Edge & { label: EDGE_LABEL };
};
