import z from "zod";
import type { TypedMergeParams } from "../api/client";
import type {
  EdgeLabelInstance,
  LabelSchemaMap,
  NodeLabelInstance,
  OntologyDefinition,
} from "../api/ontology";

const zLabelWire = z.object({
  kind: z.string(),
  props: z.record(z.string(), z.unknown()).optional(),
});

const zEdgeLabelWire = z.object({
  kind: z.string(),
  props: z.record(z.string(), z.unknown()).optional(),
});

const zEdgeWire = z.object({
  memory_key: z.string(),
  direction: z.enum(["in", "out"]),
  label: zEdgeLabelWire,
  properties: z.record(z.string(), z.unknown()).optional(),
});

/** Wire format for LLM / JSON (kinds + props); validate with {@link parseLibrarianMergePlan}. */
export const zLibrarianMergePlanWire = z.object({
  labels: z.array(zLabelWire),
  edges: z.array(zEdgeWire),
  properties: z.record(z.string(), z.unknown()).optional(),
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
