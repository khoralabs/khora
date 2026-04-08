import z from "zod";
import type { TypedMergeParams } from "../api/client";
import type {
  EdgeLabelInstance,
  LabelSchemaMap,
  NodeLabelInstance,
  OntologyDefinition,
} from "../api/ontology";

const zLabelWire = z.object({
  kind: z
    .string()
    .describe(
      "Node label kind from the ontology; must match a key in the allowed node label kinds.",
    ),
  props: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Props for this label kind, validated against the ontology schema for `kind`."),
});

const zEdgeLabelWire = z.object({
  kind: z
    .string()
    .describe(
      "Edge label kind from the ontology; must match a key in the allowed edge label kinds.",
    ),
  props: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Props for this edge label kind, validated against the ontology schema for `kind`."),
});

const zEdgeWire = z.object({
  memory_key: z
    .string()
    .describe(
      "Target memory `key` in the same namespace. Must refer to an **existing** memory only — use keys from `memory_search` hits or from prefetched context, not invented keys.",
    ),
  direction: z
    .enum(["in", "out"])
    .describe(
      "Edge direction relative to **this** (new) memory: `out` = from this memory toward the other memory's node; `in` = the opposite.",
    ),
  label: zEdgeLabelWire,
  properties: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional JSON on the edge row."),
});

/** Wire format for LLM / JSON (kinds + props); validate with {@link parseLibrarianMergePlan}. */
export const zLibrarianMergePlanWire = z.object({
  labels: z
    .array(zLabelWire)
    .describe("Node labels to assign to **this** memory's node (the logical memory being merged)."),
  edges: z
    .array(zEdgeWire)
    .describe(
      "Edges from **this** memory to **existing** memories. Every `memory_key` must already exist in the namespace (discover keys via `memory_search` or prefetched hits).",
    ),
  properties: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional JSON object on **this** memory / node row."),
});

export type LibrarianMergePlanWire = z.infer<typeof zLibrarianMergePlanWire>;

/**
 * Validates wire labels/edges against the ontology and returns merge slice compatible with
 * {@link MemoriesClient.mergeMemory}.
 */
export function parseLibrarianMergePlan<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
  wire: LibrarianMergePlanWire,
): Pick<TypedMergeParams<TNode, TEdge>, "labels" | "edges" | "properties"> {
  const labels: NodeLabelInstance<TNode>[] = wire.labels.map((l) => {
    const schema = ontology.nodeLabels[l.kind as keyof TNode];
    if (schema === undefined) {
      throw new RangeError(`Unknown node label kind: ${l.kind}`);
    }
    const props = schema.parse(l.props ?? {});
    return { kind: l.kind, props } as NodeLabelInstance<TNode>;
  });

  const edges: NonNullable<TypedMergeParams<TNode, TEdge>["edges"]> = wire.edges.map((e) => {
    const schema = ontology.edgeLabels[e.label.kind as keyof TEdge];
    if (schema === undefined) {
      throw new RangeError(`Unknown edge label kind: ${e.label.kind}`);
    }
    const props = schema.parse(e.label.props ?? {});
    const label = { kind: e.label.kind, props } as EdgeLabelInstance<TEdge>;
    return {
      memory_key: e.memory_key,
      direction: e.direction,
      label,
      properties: e.properties,
    };
  });

  return {
    labels,
    edges: edges.length > 0 ? edges : undefined,
    properties: wire.properties,
  };
}
