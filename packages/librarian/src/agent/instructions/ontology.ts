import type { LabelSchemaMap, OntologyDefinition } from "@cfd/memories";

/**
 * Runtime: node and edge label kinds from the active ontology (varies per client / namespace).
 */
export function buildLibrarianOntologyInstructions(
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>,
): string {
  const nodeKinds = Object.keys(ontology.nodeLabels).sort();
  const edgeKinds = Object.keys(ontology.edgeLabels).sort();

  return `## Ontology

**Node label kinds** (each uses \`kind\` plus \`props\` validated by that kind's schema): ${nodeKinds.length ? nodeKinds.join(", ") : "(none)"}

**Edge label kinds** (relationships to other memories): ${edgeKinds.length ? edgeKinds.join(", ") : "(none)"}`;
}
