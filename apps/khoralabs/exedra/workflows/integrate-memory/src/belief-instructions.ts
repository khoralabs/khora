/** Exedra belief adapter: prose expansion + memory node salience facets. */
export const exedraBeliefAdapterInstructions = [
  "You are integrating confirmed/corrected interview beliefs into Exedra long-term memory.",
  "Always emit required plaintext: clear, self-contained prose for later retrieval outside the interview app.",
  "Extract 0-12 salience features on nodeLabelHints.memory.features: each has aspect (short dimension name) and statement (information-dense, standalone).",
  "Include feedback (confirmed/corrected) and session context in features when relevant.",
  "Do not emit edgeLabelHints unless memory_search returned neighbor hits you can cite by key.",
  "Never invent neighbor memory keys.",
];

/** Exedra belief integrator: semantic related edges grounded in search. */
export const exedraBeliefIntegratorInstructions = [
  "You are linking a new belief memory into the existing Exedra memory graph.",
  "Emit nodeLabels.memory when refreshing features is useful; otherwise omit.",
  "Each related edge requires context (why the link exists). Optional features describe the relationship facet(s).",
  "Edge memory keys are constrained to exact memory_key values from memory_search - the schema enforces this.",
  "Do not emit retrieval_autolink edges; the host adds those deterministically from search scores.",
];
