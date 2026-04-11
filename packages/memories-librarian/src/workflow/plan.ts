import type {
  EdgeLabelInstance,
  LabelSchemaMap,
  NodeLabelInstance,
  OntologyDefinition,
  TypedMergeParams,
} from "@cfd/memories-core";
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
export function buildLibrarianMergePlanDescription(
  nodeKinds: string[],
  edgeKinds: string[],
): string {
  const n = nodeKinds.length ? nodeKinds.join(", ") : "(none — leave `labels` empty)";
  const e = edgeKinds.length ? edgeKinds.join(", ") : "(none — leave the edges array empty)";
  return `Classify and link this memory.

The "labels" field MUST be an array of objects like {"kind":"<ontology kind>","props":{}} (one object per label). Do NOT output a list of bare strings. Each "kind" MUST be one of: ${n} — not ad-hoc tags or topics.

For edges, "label" MUST be an object {"kind":"<ontology edge kind>","props":{}}; use only: ${e}.

Every edge "memory_key" must already exist (memory_search or prefetch). When a kind has no property fields, use {} or omit "props".`;
}

function buildKindPropsDiscriminatedUnion(
  kinds: readonly string[],
  schemas: Record<string, z.ZodType>,
  kindRole: "node" | "edge",
): z.ZodType {
  if (kinds.length === 0) {
    return z.object({
      kind: z.never(),
      props: z.record(z.string(), z.unknown()).optional(),
    });
  }
  const variants = kinds.map((k) => {
    const propSchema = schemas[k];
    if (propSchema === undefined) {
      throw new RangeError(`Ontology missing schema for ${kindRole} label kind: ${k}`);
    }
    return z.object({
      kind: z
        .literal(k)
        .describe(
          kindRole === "node" ? "Node label kind (ontology)." : "Edge label kind (ontology).",
        ),
      props: propSchema
        .optional()
        .describe(
          kindRole === "node"
            ? `Properties for node label "${k}" (ontology schema; omit or {} if none).`
            : `Properties for edge label "${k}" (ontology schema; omit or {} if none).`,
        ),
    });
  });
  return z.discriminatedUnion(
    "kind",
    variants as unknown as [z.core.$ZodTypeDiscriminable, ...z.core.$ZodTypeDiscriminable[]],
  );
}

function zNodeLabelWireFromOntology<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
): z.ZodType {
  const kinds = labelKindsFromOntology(ontology).node;
  const schemas = ontology.nodeLabels as Record<string, z.ZodType>;
  return buildKindPropsDiscriminatedUnion(kinds, schemas, "node");
}

function zEdgeLabelWireFromOntology<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
): z.ZodType {
  const kinds = labelKindsFromOntology(ontology).edge;
  const schemas = ontology.edgeLabels as Record<string, z.ZodType>;
  return buildKindPropsDiscriminatedUnion(kinds, schemas, "edge");
}

/** Models sometimes emit a bare string; normalize to { kind, props: {} } before ontology validation. */
function zWithStringShorthandLabel(inner: z.ZodType): z.ZodType {
  return z.preprocess((val: unknown) => {
    if (typeof val === "string") return { kind: val, props: {} };
    return val;
  }, inner);
}

function zEdgeWireFromOntology<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
): z.ZodType {
  return z.object({
    memory_key: z
      .string()
      .describe("Existing memory key (memory_search or prefetch; do not invent)."),
    direction: z
      .enum(["in", "out"])
      .describe("Relative to this memory: out = toward the other node."),
    label: zWithStringShorthandLabel(zEdgeLabelWireFromOntology(ontology)),
    properties: z.record(z.string(), z.unknown()).optional().describe("Optional edge JSON."),
  });
}

/** Wire format for LLM / JSON; kinds and per-kind `props` match the active ontology. */
export function zLibrarianMergePlanWire<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
) {
  const { node, edge } = labelKindsFromOntology(ontology);

  const labelsSchema =
    node.length === 0
      ? z.array(z.never()).describe("No node label kinds — must be empty.")
      : z
          .array(zWithStringShorthandLabel(zNodeLabelWireFromOntology(ontology)))
          .describe("Node labels: objects { kind, props? }; never a bare string.");

  const edgesSchema =
    edge.length === 0
      ? z.array(z.never()).describe("No edge label kinds — must be empty.")
      : z.array(zEdgeWireFromOntology(ontology)).describe("Edges to existing memories.");

  return z.object({
    labels: labelsSchema,
    edges: edgesSchema,
    properties: z.record(z.string(), z.unknown()).optional().describe("Optional node/memory JSON."),
  });
}

/** Parsed librarian merge plan (wire JSON); kept wide so any ontology-specific parse is ergonomic. */
export type LibrarianMergePlanWire = {
  labels: Array<{ kind: string; props?: unknown }>;
  edges: Array<{
    memory_key: string;
    direction: "in" | "out";
    label: { kind: string; props?: unknown };
    properties?: Record<string, unknown>;
  }>;
  properties?: Record<string, unknown>;
};

/** Structured output spec with ontology-driven enums + classification description. */
export function librarianMergePlanOutputFromOntology<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
>(ontology: OntologyDefinition<TNode, TEdge>) {
  return Output.object({
    name: "LibrarianMergePlan",
    description:
      'Final JSON must validate as LibrarianMergePlan (see the first system block, "Merge plan"). Field types follow the schema; do not substitute string arrays for label objects.',
    schema: zLibrarianMergePlanWire(ontology),
  });
}

/** Parse raw model output with the same ontology as the agent. */
export function parseLibrarianMergePlanWire<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
>(ontology: OntologyDefinition<TNode, TEdge>, data: unknown): LibrarianMergePlanWire {
  return zLibrarianMergePlanWire(ontology).parse(data) as LibrarianMergePlanWire;
}

/** Type parameter for `ToolLoopAgent` when using {@link librarianMergePlanOutputFromOntology}. */
export type LibrarianMergePlanStructuredOutput = ReturnType<
  typeof librarianMergePlanOutputFromOntology
>;

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
