import type { LabelSchemaMap, OntologyDefinition } from "@cfd/memories-core";

/** Short merge-plan heading; the LibrarianMergePlan structured-output schema is authoritative. */
export function buildLibrarianMergePlanInstruction<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
>(_ontology: OntologyDefinition<TNode, TEdge>): string {
  return "## Merge plan (structured output)\n\nEmit LibrarianMergePlan only via structured output; the schema defines allowed kinds, props, and edges.";
}
