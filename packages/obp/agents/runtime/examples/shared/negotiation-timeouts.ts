/** Wall-clock budget for one negotiation LLM tool-loop + provider call (server `Promise.race`). */
export const NEGOTIATION_LLM_TURN_BUDGET_MS = 300_000;

/**
 * Browser fetch timeout for `POST .../negotiation/turn`.
 * Slightly above {@link NEGOTIATION_LLM_TURN_BUDGET_MS} so the server can return a structured error first.
 */
export const NEGOTIATION_TURN_FETCH_TIMEOUT_MS = NEGOTIATION_LLM_TURN_BUDGET_MS + 30_000;
