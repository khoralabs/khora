import type z from "zod";

/**
 * Maps each **label kind** (discriminant) to a Zod schema for that label’s `props`.
 * Use `z.object({})` when a label has no extra fields.
 */
export type LabelSchemaMap = Record<string, z.ZodType>;

export type OntologyDefinition<
  TNode extends LabelSchemaMap = LabelSchemaMap,
  TEdge extends LabelSchemaMap = LabelSchemaMap,
> = {
  readonly nodeLabels: TNode;
  readonly edgeLabels: TEdge;
};

/** One node-label variant: `kind` keys `nodeLabels`; `props` validated by `nodeLabels[kind]`. */
export type NodeLabelInstance<TNode extends LabelSchemaMap> = {
  [K in keyof TNode]: {
    kind: K & string;
    props: z.infer<TNode[K]>;
  };
}[keyof TNode];

/** One edge-label variant: `kind` keys `edgeLabels`; `props` validated by `edgeLabels[kind]`. */
export type EdgeLabelInstance<TEdge extends LabelSchemaMap> = {
  [K in keyof TEdge]: {
    kind: K & string;
    props: z.infer<TEdge[K]>;
  };
}[keyof TEdge];

/** Stable string stored in `node_labels.value` / used with `ensureEdgeLabel` (includes kind + props). */
export function encodeOntologyLabel(kind: string, props: unknown): string {
  if (
    props === undefined ||
    (typeof props === "object" &&
      props !== null &&
      !Array.isArray(props) &&
      Object.keys(props).length === 0)
  ) {
    return kind;
  }
  return JSON.stringify({ kind, props });
}

export function parseOntologyLabelValue(value: string): { kind: string; props: unknown } {
  if (!value.startsWith("{")) {
    return { kind: value, props: {} };
  }
  try {
    const o = JSON.parse(value) as { kind?: string; props?: unknown };
    if (o && typeof o === "object" && typeof o.kind === "string") {
      return { kind: o.kind, props: o.props ?? {} };
    }
  } catch {
    /* fall through */
  }
  return { kind: value, props: {} };
}

export function validateNodeLabel<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
  label: NodeLabelInstance<TNode>,
): string {
  const schema = ontology.nodeLabels[label.kind as keyof TNode];
  if (schema === undefined) {
    throw new RangeError(`Unknown node label kind: ${String(label.kind)}`);
  }
  const props = schema.parse(label.props);
  return encodeOntologyLabel(label.kind, props);
}

export function validateEdgeLabel<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
  label: EdgeLabelInstance<TEdge>,
): string {
  const schema = ontology.edgeLabels[label.kind as keyof TEdge];
  if (schema === undefined) {
    throw new RangeError(`Unknown edge label kind: ${String(label.kind)}`);
  }
  const props = schema.parse(label.props);
  return encodeOntologyLabel(label.kind, props);
}

/**
 * Builds a typed ontology. Pass Zod schemas per kind; empty objects use `z.object({})`.
 *
 * @example
 * ```ts
 * const o = defineOntology({
 *   nodeLabels: {
 *     topic: z.object({ weight: z.number().optional() }),
 *     pinned: z.object({}),
 *   },
 *   edgeLabels: {
 *     relates_to: z.object({ strength: z.number().min(0).max(1) }),
 *   },
 * });
 * ```
 */
export function defineOntology<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  def: OntologyDefinition<TNode, TEdge>,
): OntologyDefinition<TNode, TEdge> {
  return def;
}
