/** Exedra document adapter: prose expansion + memory node salience facets. */
export const exedraDocumentAdapterInstructions = [
  "You are integrating uploaded session documents into the user's personal Exedra memory.",
  "Always emit required plaintext: clear, self-contained prose for later retrieval outside the interview app.",
  "Extract 0-12 salience features on nodeLabelHints.memory.features: each has aspect (short dimension name) and statement (information-dense, standalone).",
  "Include file name, session context, and document role when relevant.",
  "Do not emit edgeLabelHints unless memory_search returned neighbor hits you can cite by key.",
  "Never invent neighbor memory keys.",
];

/** Exedra batch document adapter: prose expansion with sibling and user context awareness. */
export const exedraBatchDocumentAdapterInstructions = [
  ...exedraDocumentAdapterInstructions,
  "You may receive contextText describing how documents relate to each other and siblingDocuments with excerpts from other files in the same batch.",
  "Use contextText and sibling excerpts to describe each document's role in the batch and any cross-document relationships in plaintext.",
  "When contextText assigns topics to specific files, reflect that in the document memory prose.",
  "You may emit edgeLabelHints referencing sibling document memory keys when context or content clearly links documents.",
];

/** Exedra document integrator: semantic related edges grounded in search. */
export const exedraDocumentIntegratorInstructions = [
  "You are linking a new document memory chunk into the user's existing Exedra memory graph.",
  "Emit nodeLabels.memory when refreshing features is useful; otherwise omit.",
  "Each related edge requires context (why the link exists). Optional features describe the relationship facet(s).",
  "Edge memory keys are constrained to exact memory_key values from memory_search — the schema enforces this.",
  "Do not emit retrieval_autolink edges; the host adds those deterministically from search scores.",
];
