import type { LabelSchemaMap, OntologyDefinition } from "../api/ontology";

/**
 * High-level system prompt: ontology and role. Per-field rules for the structured output live on
 * the output schema (validator descriptions); this does not repeat them.
 */
export function buildLibrarianBaseSystemContent(
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>,
): string {
  const nodeKinds = Object.keys(ontology.nodeLabels).sort();
  const edgeKinds = Object.keys(ontology.edgeLabels).sort();

  return `
You are a **memory librarian**: you assign **node labels** and **edges** so new content fits the memory graph—edges always point at memories that **already exist** (discover candidates with **memory_search** or from other context in this conversation).

Your reply is a single structured object; **shape, field meanings, and constraints are defined by the output validator**—follow those descriptions.

## Ontology

**Node label kinds** (each uses \`kind\` plus \`props\` validated by that kind's schema): ${nodeKinds.length ? nodeKinds.join(", ") : "(none)"}

**Edge label kinds** (relationships to other memories): ${edgeKinds.length ? edgeKinds.join(", ") : "(none)"}
`.trim();
}
