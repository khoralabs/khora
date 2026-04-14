import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Lexical-first Convex schema aligned with @cfd/memories-core row shapes.
 * Business ids (memoryId, etc.) are stored as string fields; Convex `_id` is internal.
 */
export default defineSchema({
  memories: defineTable({
    memoryId: v.string(),
    namespace: v.string(),
    key: v.string(),
    _ts_created: v.number(),
  })
    .index("by_memoryId", ["memoryId"])
    .index("by_namespace_key", ["namespace", "key"]),

  source_maps: defineTable({
    sourceMapId: v.string(),
    memoryId: v.string(),
    namespace: v.string(),
    source_key: v.string(),
    _ts_created: v.number(),
  })
    .index("by_sourceMapId", ["sourceMapId"])
    .index("by_memoryId", ["memoryId"]),

  text_features: defineTable({
    textFeatureId: v.string(),
    memoryId: v.string(),
    namespace: v.string(),
    sourceMapId: v.string(),
    text: v.string(),
    _ts_created: v.number(),
  })
    .index("by_textFeatureId", ["textFeatureId"])
    .index("by_memoryId", ["memoryId"])
    .index("by_sourceMapId", ["sourceMapId"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["namespace", "memoryId"],
    }),

  nodes: defineTable({
    nodeId: v.string(),
    memoryId: v.string(),
    namespace: v.string(),
    value: v.string(),
    propertiesJson: v.optional(v.string()),
    _ts_created: v.number(),
  })
    .index("by_nodeId", ["nodeId"])
    .index("by_memoryId", ["memoryId"]),

  node_labels: defineTable({
    labelId: v.string(),
    kind: v.string(),
    description: v.string(),
    schemaJson: v.union(v.string(), v.null()),
    _ts_created: v.number(),
  }).index("by_labelId", ["labelId"]).index("by_kind", ["kind"]),

  edge_labels: defineTable({
    labelId: v.string(),
    kind: v.string(),
    description: v.string(),
    schemaJson: v.union(v.string(), v.null()),
    _ts_created: v.number(),
  }).index("by_labelId", ["labelId"]).index("by_kind", ["kind"]),

  edges: defineTable({
    edgeId: v.string(),
    fromNodeId: v.string(),
    toNodeId: v.string(),
    namespace: v.string(),
    propertiesJson: v.optional(v.string()),
    idPartsSelfKey: v.string(),
    idPartsOtherKey: v.string(),
    idPartsLabel: v.string(),
    _ts_created: v.number(),
  })
    .index("by_edgeId", ["edgeId"])
    .index("by_from", ["fromNodeId"])
    .index("by_to", ["toNodeId"]),

  node_label_assignments: defineTable({
    assignmentId: v.string(),
    nodeId: v.string(),
    labelId: v.string(),
    propsJson: v.string(),
    _ts_created: v.number(),
  })
    .index("by_assignmentId", ["assignmentId"])
    .index("by_node_label", ["nodeId", "labelId"]),

  edge_label_assignments: defineTable({
    assignmentId: v.string(),
    edgeId: v.string(),
    labelId: v.string(),
    propsJson: v.string(),
    _ts_created: v.number(),
  })
    .index("by_assignmentId", ["assignmentId"])
    .index("by_edge_label", ["edgeId", "labelId"]),
});
