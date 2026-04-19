import { z } from "zod";
import type { OntologyLabelInstance } from "../models/ontology-label";

export type { OntologyLabelInstance };

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

export function validateNodeLabel<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
  label: { kind: string; props: unknown },
): { kind: string; props: Record<string, unknown> } {
  const schema = ontology.nodeLabels[label.kind as keyof TNode];
  if (schema === undefined) {
    throw new RangeError(`Unknown node label kind: ${String(label.kind)}`);
  }
  const props = schema.parse(label.props) as Record<string, unknown>;
  return { kind: label.kind, props };
}

export function validateEdgeLabel<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
  label: { kind: string; props: unknown },
): { kind: string; props: Record<string, unknown> } {
  const schema = ontology.edgeLabels[label.kind as keyof TEdge];
  if (schema === undefined) {
    throw new RangeError(`Unknown edge label kind: ${String(label.kind)}`);
  }
  const props = schema.parse(label.props) as Record<string, unknown>;
  return { kind: label.kind, props };
}

/** JSON Schema (Draft 2020-12) object for a Zod props schema, for catalog persistence. */
export function zodPropsSchemaToJson(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

/** Returns the Zod props schema for a node label kind, or `undefined` if unknown. */
export function nodeLabelPropsSchema<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
  kind: string,
): z.ZodType | undefined {
  const s = ontology.nodeLabels[kind as keyof TNode];
  return s === undefined ? undefined : s;
}

/** Returns the Zod props schema for an edge label kind, or `undefined` if unknown. */
export function edgeLabelPropsSchema<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  ontology: OntologyDefinition<TNode, TEdge>,
  kind: string,
): z.ZodType | undefined {
  const s = ontology.edgeLabels[kind as keyof TEdge];
  return s === undefined ? undefined : s;
}

/**
 * Builds a typed ontology. Pass Zod schemas per kind; empty objects use `z.object({})`.
 */
export function defineOntology<TNode extends LabelSchemaMap, TEdge extends LabelSchemaMap>(
  def: OntologyDefinition<TNode, TEdge>,
): OntologyDefinition<TNode, TEdge> {
  return def;
}
