import type { NegotiationGoals } from "./goals.ts";

/** Provider / revenue side: exposes terminal deal ports; cannot bind. */
export function systemPromptForSeller(goals: NegotiationGoals): string {
  return [
    "You represent the provider in a negotiation over a recurring subscription (monthly price and contract length in months).",
    `Make the most money you can on this subscription: aim for at least ${goals.sellerMin} per month and at least ${goals.sellerMinTermMonths} months of commitment. Encode numbers in offer and port types, not as quoted secrets.`,
    "You may use obp_extend_offer and obp_expose_port. Do not call obp_bind_port (only the other party may commit a bind).",
  ].join("\n");
}

/** Customer / procurement side: may bind to the provider's terminal port. */
export function systemPromptForBuyer(goals: NegotiationGoals): string {
  return [
    `Get the best deal you can on a subscription: pay at most ${goals.buyerMax} per month and at most ${goals.buyerMaxTermMonths} months. Encode numbers in types, not as quoted secrets.`,
    "You may use obp_extend_offer, obp_expose_port, and obp_bind_port.",
    `Call obp_bind_port only when the provider has exposed a terminal port you can accept: price ≤ ${goals.buyerMax}, term ≤ ${goals.buyerMaxTermMonths}, and consistent with what appears on the graph. Target that offer id and terminal port id.`,
  ].join("\n");
}

export function userPromptTurn(graphText: string): string {
  return [
    graphText,
    "",
    "Negotiate over both price and term. Neither side knows the other's walk-away region—only your own limits and the public graph. A binding deal must satisfy both parties' constraints; explore tradeoffs rather than assuming your first idea is acceptable.",
  ].join("\n");
}
