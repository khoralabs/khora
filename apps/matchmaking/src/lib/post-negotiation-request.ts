import z from "zod";

export const postNegotiationReviewRequestSchema = z.object({
  runId: z.uuid(),
  decision: z.enum(["accept", "decline"]),
  agentFeedback: z.string().optional(),
});

export const postMeetingReflectionRequestSchema = z.object({
  runId: z.uuid(),
  text: z.string().min(1, "Reflection cannot be empty"),
  goalsSnapshot: z.array(z.string().min(1)).optional(),
});

export type PostNegotiationReviewRequest = z.infer<typeof postNegotiationReviewRequestSchema>;
export type PostMeetingReflectionRequest = z.infer<typeof postMeetingReflectionRequestSchema>;
