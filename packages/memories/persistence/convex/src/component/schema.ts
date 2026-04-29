import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import type { ConvexVectorDimension } from "./lib/vectorConfig.js";

const nsPrefixFields = {
  nsPrefix1: v.optional(v.string()),
  nsPrefix2: v.optional(v.string()),
  nsPrefix3: v.optional(v.string()),
  nsPrefix4: v.optional(v.string()),
  nsPrefix5: v.optional(v.string()),
  nsPrefix6: v.optional(v.string()),
};

const NS_PREFIX_FILTER_FIELDS = [
  "nsPrefix1",
  "nsPrefix2",
  "nsPrefix3",
  "nsPrefix4",
  "nsPrefix5",
  "nsPrefix6",
] as const;

/** Fresh table per dimension — reusing one `defineTable` chain duplicates vector index definitions. */
function defineVectorFeaturesTable(dim: ConvexVectorDimension) {
  return defineTable({
    vectorFeatureId: v.string(),
    memoryId: v.string(),
    /** Full path string (audit / hydration); subtree filters use `nsPrefix*`. */
    namespace: v.string(),
    ...nsPrefixFields,
    sourceMapId: v.string(),
    vector: v.array(v.float64()),
    tsCreated: v.number(),
  })
    .index("by_vectorFeatureId", ["vectorFeatureId"])
    .index("by_memoryId_tsCreated", ["memoryId", "tsCreated"])
    .index("by_sourceMapId", ["sourceMapId"])
    .vectorIndex("search_vector", {
      vectorField: "vector",
      dimensions: dim,
      filterFields: [...NS_PREFIX_FILTER_FIELDS, "memoryId"] as const,
    });
}

/**
 * Lexical-first Convex schema aligned with @cfd/memories-core row shapes.
 * Business ids (memoryId, etc.) are stored as string fields; Convex `_id` is internal.
 */
export default defineSchema({
  memories: defineTable({
    memoryId: v.string(),
    namespace: v.string(),
    key: v.string(),
    tsCreated: v.number(),
  })
    .index("by_memoryId_tsCreated", ["memoryId", "tsCreated"])
    .index("by_namespace_key", ["namespace", "key"]),

  source_maps: defineTable({
    sourceMapId: v.string(),
    memoryId: v.string(),
    namespace: v.string(),
    sourceKey: v.string(),
    tsCreated: v.number(),
  })
    .index("by_sourceMapId", ["sourceMapId"])
    .index("by_memoryId_tsCreated", ["memoryId", "tsCreated"]),

  text_features: defineTable({
    textFeatureId: v.string(),
    memoryId: v.string(),
    /** Full path string (audit / hydration); subtree filters use `nsPrefix*`. */
    namespace: v.string(),
    ...nsPrefixFields,
    sourceMapId: v.string(),
    text: v.string(),
    tsCreated: v.number(),
  })
    .index("by_textFeatureId", ["textFeatureId"])
    .index("by_memoryId_tsCreated", ["memoryId", "tsCreated"])
    .index("by_sourceMapId", ["sourceMapId"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: [...NS_PREFIX_FILTER_FIELDS],
    }),

  vector_features_768: defineVectorFeaturesTable(768),
  vector_features_1024: defineVectorFeaturesTable(1024),
  vector_features_1536: defineVectorFeaturesTable(1536),
  vector_features_3072: defineVectorFeaturesTable(3072),

  nodes: defineTable({
    nodeId: v.string(),
    memoryId: v.string(),
    namespace: v.string(),
    value: v.string(),
    propertiesJson: v.optional(v.string()),
    tsCreated: v.number(),
  })
    .index("by_nodeId", ["nodeId"])
    .index("by_memoryId_tsCreated", ["memoryId", "tsCreated"]),

  node_labels: defineTable({
    labelId: v.string(),
    kind: v.string(),
    description: v.string(),
    schemaJson: v.union(v.string(), v.null()),
    tsCreated: v.number(),
  })
    .index("by_labelId", ["labelId"])
    .index("by_kind", ["kind"]),

  edge_labels: defineTable({
    labelId: v.string(),
    kind: v.string(),
    description: v.string(),
    schemaJson: v.union(v.string(), v.null()),
    tsCreated: v.number(),
  })
    .index("by_labelId", ["labelId"])
    .index("by_kind", ["kind"]),

  edges: defineTable({
    edgeId: v.string(),
    fromNodeId: v.string(),
    toNodeId: v.string(),
    namespace: v.string(),
    propertiesJson: v.optional(v.string()),
    idPartsSelfKey: v.string(),
    idPartsOtherKey: v.string(),
    idPartsLabel: v.string(),
    tsCreated: v.number(),
  })
    .index("by_edgeId", ["edgeId"])
    .index("by_from", ["fromNodeId"])
    .index("by_to", ["toNodeId"])
    .index("by_namespace", ["namespace"]),

  node_label_assignments: defineTable({
    assignmentId: v.string(),
    nodeId: v.string(),
    labelId: v.string(),
    propsJson: v.string(),
    tsCreated: v.number(),
  })
    .index("by_assignmentId", ["assignmentId"])
    .index("by_node_label", ["nodeId", "labelId"]),

  edge_label_assignments: defineTable({
    assignmentId: v.string(),
    edgeId: v.string(),
    labelId: v.string(),
    propsJson: v.string(),
    tsCreated: v.number(),
  })
    .index("by_assignmentId", ["assignmentId"])
    .index("by_edge_label", ["edgeId", "labelId"]),
});
