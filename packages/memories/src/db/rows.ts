/**
 * Row shapes produced by the default SQLite persistence strategy.
 * Keep aligned with `schema` in `@cfd/memories-core-persistence/sqlite` (Zod + DDL).
 */

export type Memory = {
  _id: string;
  _ts_created: number;
  namespace: string;
  key: string;
};

export type SourceMap = {
  _id: string;
  _ts_created: number;
  memory_id: string;
  source_key: string;
};

export type TextFeature = {
  _id: string;
  _ts_created: number;
  memory_id: string;
  source_map_id: string;
  text: string;
};

export type VectorFeature = {
  _id: string;
  _ts_created: number;
  memory_id: string;
  source_map_id: string;
  vector: number[];
};

export type NodeLabel = {
  _id: string;
  _ts_created: number;
  value: string;
  description: string;
};

export type EdgeLabel = {
  _id: string;
  _ts_created: number;
  value: string;
  description: string;
};

export type EdgeLabelAssignment = {
  _id: string;
  _ts_created: number;
  edge_id: string;
  label_id: string;
};

export type NodeLabelAssignment = {
  _id: string;
  _ts_created: number;
  node_id: string;
  label_id: string;
};

export type Node = {
  _id: string;
  _ts_created: number;
  value: string;
  properties?: Record<string, unknown>;
};

export type Edge = {
  _id: string;
  _ts_created: number;
  from_node_id: string;
  to_node_id: string;
  properties?: Record<string, unknown>;
};
