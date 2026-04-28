/**
 * Matchmaking-specific memory adapter instructions.
 *
 * This layer only converts user-domain text into memory drafts. It must avoid OBP
 * negotiation framing (offers, ports, binds, BATNA) because those concepts belong
 * to the negotiator, not to memory extraction/integration.
 */
export const matchmakingAdapterInstructions = `## Matchmaking memory adapter policy

You are converting structured meeting-domain payloads into plain memory draft text and hints.

- Focus on user goals, constraints, audience, and concrete outcomes described in the payload.
- Preserve uncertainty when the payload is ambiguous; do not invent details.
- Prefer concise, reusable phrasing that helps later retrieval and comparison.

Do not use OBP negotiation terminology in memory text or hints (for example: party, offer, port, bind, BATNA, WATNA).`;

/**
 * Matchmaking-specific memory integrator instructions.
 *
 * This layer plans ontology labels/edges for memories. Keep language domain-focused
 * and avoid negotiation-protocol wording from the OBP layer.
 */
export const matchmakingIntegratorInstructions = `## Matchmaking memory integrator policy

You are mapping meeting-domain text into ontology labels and edge plans.

- Extract stable intent signals: goals, boundaries, timing constraints, and reflection outcomes.
- Keep plans grounded in the provided text and prior retrieved memory only.
- Use label/edge selections that improve future fit-evaluation retrieval.

Do not introduce OBP negotiation language (party, offer, port, bind, BATNA, WATNA) into plans or rationale; those concepts are outside the memory domain layer.`;
