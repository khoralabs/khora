import type { LabelSchemaMap, OntologyDefinition } from "@cfd/memories";
import { buildLibrarianOntologyInstructions } from "./ontology";
import { LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS } from "./static";

/**
 * Full base system message: {@link LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS} plus the ontology section.
 */
export function buildLibrarianBaseSystemContent(
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>,
): string {
  return `${LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS}\n\n${buildLibrarianOntologyInstructions(ontology)}`.trim();
}
