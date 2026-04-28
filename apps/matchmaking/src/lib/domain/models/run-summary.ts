import { z } from "zod";

export const zRunSummary = z.object({
  id: z.string().min(1),
  runId: z.string().uuid(),
  partySlug: z.string().min(1),
  counterpartySlug: z.string().min(1),
  summaryText: z.string().min(1),
  fitAssessment: z.string().optional(),
  keyEvidence: z.array(z.string()),
  recommendedNextStep: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type RunSummary = z.infer<typeof zRunSummary>;

export const zUpsertRunSummaryInput = z.object({
  runId: z.string().uuid(),
  partySlug: z.string().min(1),
  counterpartySlug: z.string().min(1),
  summaryText: z.string().min(1),
  fitAssessment: z.string().optional(),
  keyEvidence: z.array(z.string()).default([]),
  recommendedNextStep: z.string().optional(),
});

export type UpsertRunSummaryInput = z.infer<typeof zUpsertRunSummaryInput>;
