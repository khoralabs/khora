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
    tsCreated: v.number(),
  })
    .index("by_memoryId_tsCreated", ["memoryId", "tsCreated"])
    .index("by_namespace_key", ["namespace", "key"]),

  source_maps: defineTable({
    sourceMapId: v.string(),
    memoryId: v.string(),
    namespace: v.string(),
    source_key: v.string(),
    tsCreated: v.number(),
  })
    .index("by_sourceMapId", ["sourceMapId"])
    .index("by_memoryId_tsCreated", ["memoryId", "tsCreated"]),

  text_features: defineTable({
    textFeatureId: v.string(),
    memoryId: v.string(),
    /** Full path string (audit / hydration); not a search filter. */
    namespace: v.string(),
    ns_l0: v.optional(v.string()),
    ns_l1: v.optional(v.string()),
    ns_l2: v.optional(v.string()),
    ns_l3: v.optional(v.string()),
    ns_l4: v.optional(v.string()),
    ns_l5: v.optional(v.string()),
    sourceMapId: v.string(),
    text: v.string(),
    tsCreated: v.number(),
  })
    .index("by_textFeatureId", ["textFeatureId"])
    .index("by_memoryId_tsCreated", ["memoryId", "tsCreated"])
    .index("by_sourceMapId", ["sourceMapId"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["ns_l0", "ns_l1", "ns_l2", "ns_l3", "ns_l4", "ns_l5"],
    }),

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
    .index("by_to", ["toNodeId"]),

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
