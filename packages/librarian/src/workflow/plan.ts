import type {
  EdgeLabelInstance,
  LabelSchemaMap,
  NodeLabelInstance,
  OntologyDefinition,
  TypedMergeParams,
} from "@cfd/memories";
import { Output } from "ai";
import z from "zod";

/** Sorted ontology label kind strings (stable for schema + parsing). */
export function labelKindsFromOntology<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
): { node: string[]; edge: string[] } {
  return {
    node: Object.keys(ontology.nodeLabels).sort(),
    edge: Object.keys(ontology.edgeLabels).sort(),
  };
}

/** Description for structured output: allowed kinds + merge constraints (replaces a separate ontology system block). */
export function buildLibrarianMergePlanDescription(nodeKinds: string[], edgeKinds: string[]): string {
  const n = nodeKinds.length ? nodeKinds.join(", ") : "(none — leave `labels` empty)";
  const e = edgeKinds.length ? edgeKinds.join(", ") : "(none — leave `edges` empty)";
  return `Classify and link this memory. Use only these node label kinds: ${n}. For edges to other memories, use only these edge label kinds: ${e}. Every edge \`memory_key\` must already exist (memory_search or prefetch).`;
}

function zLabelWire(nodeKinds: readonly string[]) {
  if (nodeKinds.length === 0) {
    return z.object({
      kind: z.never(),
      props: z.record(z.string(), z.unknown()).optional(),
    });
  }
  return z.object({
    kind: z.enum(nodeKinds as [string, ...string[]]).describe("Node label kind (ontology)."),
    props: z.record(z.string(), z.unknown()).optional().describe("Props for this kind."),
  });
}

function zEdgeLabelWire(edgeKinds: readonly string[]) {
  if (edgeKinds.length === 0) {
    return z.object({
      kind: z.never(),
      props: z.record(z.string(), z.unknown()).optional(),
    });
  }
  return z.object({
    kind: z.enum(edgeKinds as [string, ...string[]]).describe("Edge label kind (ontology)."),
    props: z.record(z.string(), z.unknown()).optional().describe("Props for this kind."),
  });
}

function zEdgeWire(edgeKinds: readonly string[]) {
  return z.object({
    memory_key: z
      .string()
      .describe("Existing memory key (memory_search or prefetch; do not invent)."),
    direction: z.enum(["in", "out"]).describe("Relative to this memory: out = toward the other node."),
    label: zEdgeLabelWire(edgeKinds),
    properties: z.record(z.string(), z.unknown()).optional().describe("Optional edge JSON."),
  });
}

/** Wire format for LLM / JSON; kinds are constrained to the active ontology. */
export function zLibrarianMergePlanWire(nodeKinds: readonly string[], edgeKinds: readonly string[]) {
  const labelsSchema =
    nodeKinds.length === 0
      ? z.array(z.never()).describe("No node label kinds — must be empty.")
      : z.array(zLabelWire(nodeKinds)).describe("Node labels for this memory.");

  const edgesSchema =
    edgeKinds.length === 0
      ? z.array(z.never()).describe("No edge label kinds — must be empty.")
      : z.array(zEdgeWire(edgeKinds)).describe("Edges to existing memories.");

  return z.object({
    labels: labelsSchema,
    edges: edgesSchema,
    properties: z.record(z.string(), z.unknown()).optional().describe("Optional node/memory JSON."),
  });
}

export type LibrarianMergePlanWire = z.infer<ReturnType<typeof zLibrarianMergePlanWire>>;

/** Structured output spec with ontology-driven enums + classification description. */
export function librarianMergePlanOutputFromOntology<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
) {
  const { node, edge } = labelKindsFromOntology(ontology);
  return Output.object({
    name: "LibrarianMergePlan",
    description: buildLibrarianMergePlanDescription(node, edge),
    schema: zLibrarianMergePlanWire(node, edge),
  });
}

/** Parse raw model output with the same ontology as the agent. */
export function parseLibrarianMergePlanWire<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
  data: unknown,
): LibrarianMergePlanWire {
  const { node, edge } = labelKindsFromOntology(ontology);
  return zLibrarianMergePlanWire(node, edge).parse(data);
}

/** Type parameter for `ToolLoopAgent` when using {@link librarianMergePlanOutputFromOntology}. */
export type LibrarianMergePlanStructuredOutput = ReturnType<typeof librarianMergePlanOutputFromOntology>;

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
