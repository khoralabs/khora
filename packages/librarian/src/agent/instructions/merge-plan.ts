import type { LabelSchemaMap, OntologyDefinition } from "@cfd/memories";
import { buildLibrarianMergePlanDescription, labelKindsFromOntology } from "../../workflow/plan.js";

/**
 * Merge-plan rules for the librarian (allowed kinds, labels/edges JSON shape). Placed as the first
 * {@link RegisteredAgentIdentity.staticInstructions} line so it is early in the system prompt and
 * included in {@link RegisteredAgentIdentity.staticHash} via {@code createRegisteredAgentIdentity}.
 */
export function buildLibrarianMergePlanInstruction<
  TNode extends LabelSchemaMap,
  TEdge extends LabelSchemaMap,
>(ontology: OntologyDefinition<TNode, TEdge>): string {
  const { node, edge } = labelKindsFromOntology(ontology);
  return `## Merge plan (structured output)\n\n${buildLibrarianMergePlanDescription(node, edge)}`;
}
