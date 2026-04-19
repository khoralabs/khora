import { type PriceBand, priceInZone } from "@cfd/obp-tools";

/**
 * Private bounds for multi-issue negotiation (price + contract term in months).
 * Seller wants price ≥ sellerMin and term ≥ sellerMinTermMonths (commitment).
 * Buyer wants price ≤ buyerMax and term ≤ buyerMaxTermMonths (cost and flexibility).
 * A feasible deal must lie in the rectangle [sellerMin, buyerMax] × [sellerMinTermMonths, buyerMaxTermMonths]
 * (requires sellerMin ≤ buyerMax and sellerMinTermMonths ≤ buyerMaxTermMonths).
 */
export type NegotiationGoals = {
  buyerMax: number;
  sellerMin: number;
  sellerMinTermMonths: number;
  buyerMaxTermMonths: number;
};

/**
 * Default for the LLM demo: **tight** overlap so a self-interested opening (e.g. high price) is often outside
 * the mutual region—parties must discover tradeoffs via the graph. Each side only receives its own bounds in prompts;
 * the overlap is not stated to either agent.
 */
export const DEFAULT_NEGOTIATION_GOALS: NegotiationGoals = {
  sellerMin: 46,
  buyerMax: 47,
  sellerMinTermMonths: 17,
  buyerMaxTermMonths: 19,
};

export function goalsToPriceBand(goals: NegotiationGoals): PriceBand {
  return { min: goals.sellerMin, max: goals.buyerMax };
}

export function termInZone(termMonths: number, goals: NegotiationGoals): boolean {
  return termMonths >= goals.sellerMinTermMonths && termMonths <= goals.buyerMaxTermMonths;
}

export { priceInZone };
