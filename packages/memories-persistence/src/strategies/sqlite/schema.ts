import z from "zod";
import { defineSchema, zId } from "./_lib";

/**
 * A memory is a collection of features with tightly shared semantics
 */
export const zMemory = z.object({
  namespace: z.string(),
  key: z.string(),
});

/**
 * One memory may have many sourcemaps; one for each feature
 * Each vector feature and text feature has one sourcemap
 */
export const zSourceMap = z.object({
  memory_id: zId("memories"),
  source_key: z.string(),
});

/**
 * Plaintext chunks have one text feature
 * Text files have n text features; one for each text chunk
 * Binary files have no text features
 */
export const zTextFeature = z.object({
  memory_id: zId("memories"),
  source_map_id: zId("source_maps"),
  text: z.string(),
});

/**
 * Plaintext chunks have one vector feature
 * Text files have n vector features; one for each text chunk
 * Binary files have one vector feature
 */
export const zVectorFeature = z.object({
  memory_id: zId("memories"),
  source_map_id: zId("source_maps"),
  vector: z.array(z.float32()).min(512).max(3072),
});

/**
 * Ontological primitives for nodes
 */
export const zNodeLabel = z.object({
  value: z.string(),
  description: z.string(),
});

/**
 * Ontological primitives for edges
 */
export const zEdgeLabel = z.object({
  value: z.string(),
  description: z.string(),
});

/**
 * One edge may have many labels
 */
export const zEdgeLabelAssignment = z.object({
  edge_id: zId("edges"),
  label_id: zId("edge_labels"),
});

/**
 * One node may have many labels
 */
export const zNodeLabelAssignment = z.object({
  node_id: zId("nodes"),
  label_id: zId("node_labels"),
});

/**
 * Each memory has one node
 */
export const zNode = z.object({
  value: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Each node has many edges to provide structural links between it and other memories
 */
export const zEdge = z.object({
  from_node_id: zId("nodes"),
  to_node_id: zId("nodes"),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const schema = defineSchema({
  source_maps: zSourceMap,
  memories: zMemory,
  text_features: zTextFeature,
  vector_features: zVectorFeature,
  nodes: zNode,
  edges: zEdge,
  node_labels: zNodeLabel,
  edge_labels: zEdgeLabel,
  node_label_assignments: zNodeLabelAssignment,
  edge_label_assignments: zEdgeLabelAssignment,
});

export type Schema = z.infer<typeof schema>;
export type Memory = Schema["memories"];
export type SourceMap = Schema["source_maps"];
export type TextFeature = Schema["text_features"];
export type VectorFeature = Schema["vector_features"];
export type Node = Schema["nodes"];
export type Edge = Schema["edges"];
export type NodeLabel = Schema["node_labels"];
export type EdgeLabel = Schema["edge_labels"];
export type NodeLabelAssignment = Schema["node_label_assignments"];
export type EdgeLabelAssignment = Schema["edge_label_assignments"];
