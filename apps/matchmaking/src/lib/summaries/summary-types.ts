import { z } from "zod";

export const zPartyRunSummary = z.object({
  partySlug: z.string().min(1),
  counterpartySlug: z.string().min(1),
  summaryText: z.string().min(1),
  fitAssessment: z.string().optional(),
  keyEvidence: z.array(z.string()),
  recommendedNextStep: z.string().optional(),
});

export type PartyRunSummary = z.infer<typeof zPartyRunSummary>;

export const zRunSummariesApiResponse = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("pending"),
  }),
  z.object({
    status: z.literal("ready"),
    summaries: z.array(zPartyRunSummary).length(2),
  }),
]);

export type RunSummariesApiResponse = z.infer<typeof zRunSummariesApiResponse>;
