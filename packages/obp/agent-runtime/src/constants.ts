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
