import z from "zod";
import { MEMORY_NAMESPACE_PATH_REGEX } from "../models/namespace-path";
import { defineSchema, zId } from "./define-schema";

/**
 * A memory is a collection of features with tightly shared semantics
 */
export const zMemory = z.object({
  namespace: z.string().regex(MEMORY_NAMESPACE_PATH_REGEX).max(128),
  key: z.string(),
  /** Denormalized namespace path segments for subtree filtering (1..6 levels). */
  ns_l0: z.string().optional(),
  ns_l1: z.string().optional(),
  ns_l2: z.string().optional(),
  ns_l3: z.string().optional(),
  ns_l4: z.string().optional(),
  ns_l5: z.string().optional(),
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

/** Embedding vector payload: same dimension bounds as `vector_features.vector`. */
export const zVectorPayload = z.array(z.float32()).min(512).max(3072);

/**
 * Plaintext chunks have one vector feature
 * Text files have n vector features; one for each text chunk
 * Binary files have one vector feature
 */
export const zVectorFeature = z.object({
  memory_id: zId("memories"),
  source_map_id: zId("source_maps"),
  vector: zVectorPayload,
});

/**
 * Ontological catalog: one row per node label **kind**
 */
export const zNodeLabel = z.object({
  kind: z.string(),
  description: z.string(),
  /** JSON Schema (Draft 2020-12) text for assignment `props`, or null. */
  schema: z.string().nullable(),
});

/**
 * Ontological catalog: one row per edge label **kind**
 */
export const zEdgeLabel = z.object({
  kind: z.string(),
  description: z.string(),
  schema: z.string().nullable(),
});

/**
 * Instance: at most one row per (edge_id, label_id)
 */
export const zEdgeLabelAssignment = z.object({
  edge_id: zId("edges"),
  label_id: zId("edge_labels"),
  props: z.record(z.string(), z.unknown()),
});

/**
 * Instance: at most one row per (node_id, label_id)
 */
export const zNodeLabelAssignment = z.object({
  node_id: zId("nodes"),
  label_id: zId("node_labels"),
  props: z.record(z.string(), z.unknown()),
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

/**
 * Canonical composed document schema for the memories persistence relational model.
 */
export const memoriesPersistenceDocumentSchema = defineSchema({
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

/** Denormalized row for JSONL export / prefetch (join of text_features + source_maps). */
export const zTextFeatureExportRow = z.object({
  memory_id: zId("memories"),
  source_key: z.string(),
  text: z.string(),
});

export type MemoriesPersistenceSchema = z.infer<typeof memoriesPersistenceDocumentSchema>;

export type Memory = MemoriesPersistenceSchema["memories"];
export type SourceMap = MemoriesPersistenceSchema["source_maps"];
export type TextFeature = MemoriesPersistenceSchema["text_features"];
export type VectorFeature = MemoriesPersistenceSchema["vector_features"];
export type Node = MemoriesPersistenceSchema["nodes"];
export type Edge = MemoriesPersistenceSchema["edges"];
export type NodeLabel = MemoriesPersistenceSchema["node_labels"];
export type EdgeLabel = MemoriesPersistenceSchema["edge_labels"];
export type NodeLabelAssignment = MemoriesPersistenceSchema["node_label_assignments"];
export type EdgeLabelAssignment = MemoriesPersistenceSchema["edge_label_assignments"];

export type TextFeatureExportRow = z.infer<typeof zTextFeatureExportRow>;
