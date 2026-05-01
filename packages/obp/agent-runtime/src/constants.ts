/**
 * Synthetic negotiation ports are keyed by the counterparty **head** offer id so each new counterparty
 * surface gets distinct port rows (required by persistence) while staying deterministic for the union.
 *
 * @see README.md — system ports
 */
export const OBP_AGENT_RUNTIME_NOOP_PREFIX = "obp-ar-noop:";

export const OBP_AGENT_RUNTIME_WALK_AWAY_PREFIX = "obp-ar-walkaway:";

export const OBP_AGENT_RUNTIME_NOOP_PORT_TYPE = "obp.agent-runtime/noop";

export const OBP_AGENT_RUNTIME_WALK_AWAY_PORT_TYPE = "obp.agent-runtime/walk-away";

/** Counterparty-facing explanation for the synthetic noop port (stored on `Port.description`). */
export const OBP_AGENT_RUNTIME_NOOP_PORT_DESCRIPTION =
  "Bind this port to advance your side without accepting any listed counterparty affordance (keep-alive). Set your new offerType; you may expose new ports on your offer unless a rule forbids it.";

/** Counterparty-facing explanation for the synthetic walk-away port (stored on `Port.description`). */
export const OBP_AGENT_RUNTIME_WALK_AWAY_PORT_DESCRIPTION =
  "Bind this port to end the negotiation without accepting a counterparty affordance (walk away).";

/**
 * JSON value for binding a port that has no `bind_policy`. This is a **string** (not `true`) so
 * Google Gemini `response_schema` / JSON Schema accept the shape: Gemini rejects boolean `enum`
 * values (HTTP 500: enum[0] must be TYPE_STRING).
 */
export const OBP_NEGOTIATION_BIND_NO_POLICY = "obp:bind" as const;

export function noopPortIdForHeadOffer(headOfferId: string): string {
  return `${OBP_AGENT_RUNTIME_NOOP_PREFIX}${headOfferId}`;
}

export function walkAwayPortIdForHeadOffer(headOfferId: string): string {
  return `${OBP_AGENT_RUNTIME_WALK_AWAY_PREFIX}${headOfferId}`;
}

export function isRuntimeNoopPortId(portId: string, headOfferId: string): boolean {
  return portId === noopPortIdForHeadOffer(headOfferId);
}

export function isRuntimeWalkAwayPortId(portId: string, headOfferId: string): boolean {
  return portId === walkAwayPortIdForHeadOffer(headOfferId);
}
