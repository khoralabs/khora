import { z } from "zod";

export const zNegotiationSummaryOutput = z.object({
  summaryText: z.string().min(1),
  fitAssessment: z.string().optional(),
  keyEvidence: z.array(z.string().min(1)).default([]),
  recommendedNextStep: z.string().optional(),
});

export type NegotiationSummaryOutput = z.infer<typeof zNegotiationSummaryOutput>;
