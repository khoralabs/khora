import type { PartyRunSummary } from "./summaries/summary-types.ts";

/** Content for the post-negotiation gate: human requester only. */
export type PostNegotiationGateContent = {
  summaryFromAgent: string;
  keyPoints: string;
  fit: string;
  suggestedNextStep: string;
};

export function stubPostNegotiationGateContent(result: unknown): PostNegotiationGateContent {
  const r = result as Record<string, unknown> | null;
  const status = r && typeof r.status === "string" ? r.status : "unknown";
  const rounds = r && typeof r.rounds === "number" ? r.rounds : "?";
  return {
    summaryFromAgent: `Negotiation result: ${status} (${String(rounds)} round(s) in the dev log). When summary generation finishes, your agent’s recap will appear here.`,
    keyPoints: `1. Review scope and tone in the live transcript (dev drawer).\n2. Compare against your stated values in memory.\n3. Choose accept or decline based on fit.`,
    fit: "Placeholder: no generated fit assessment yet.",
    suggestedNextStep: "Open the developer drawer to read the full thread, or wait for your summary to finish generating.",
  };
}

export function gateContentFromRequesterSummary(requesterSummary: PartyRunSummary): PostNegotiationGateContent {
  const keyPoints =
    requesterSummary.keyEvidence.length > 0
      ? requesterSummary.keyEvidence.map((e, i) => `${i + 1}. ${e}`).join("\n")
      : "No bullet points listed; use the summary above to judge fit.";
  return {
    summaryFromAgent: requesterSummary.summaryText,
    keyPoints,
    fit:
      requesterSummary.fitAssessment ??
      "No explicit fit line from the model; use the summary and key points.",
    suggestedNextStep:
      requesterSummary.recommendedNextStep ??
      "Decide whether to accept or decline the meeting based on the above.",
  };
}
