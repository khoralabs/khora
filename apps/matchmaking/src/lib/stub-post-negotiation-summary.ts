/**
 * Placeholder until a real post-negotiation agent reads the OBP + plaintext thread
 * and emits a structured agenda and per-twin value recommendations.
 */
export function stubPostNegotiationGateContent(result: unknown): {
  fitSummary: string;
  agenda: string;
  recommendationRequester: string;
  recommendationRequestee: string;
} {
  const r = result as Record<string, unknown> | null;
  const status = r && typeof r.status === "string" ? r.status : "unknown";
  const rounds = r && typeof r.rounds === "number" ? r.rounds : "?";
  return {
    fitSummary: `Negotiation result: ${status} (${String(rounds)} round(s) in the dev log). A future summarizer pass will read the OBP + thread; this is a static placeholder for the demo UI.`,
    agenda: `1. Check alignment on scope and time  
2. Compare against each party’s stated values (memory)  
3. Propose a narrow commitment or a clean decline (this demo: see transcript)`,
    recommendationRequester:
      "Placeholder: review the drawer transcript. When the summarizer ships, you’ll get a per-twin fit read grounded in your graph.",
    recommendationRequestee:
      "Placeholder: same for the invited party’s view — the full product reports fit before accept/decline on their side.",
  };
}

export type PostNegotiationGateContent = ReturnType<typeof stubPostNegotiationGateContent>;
