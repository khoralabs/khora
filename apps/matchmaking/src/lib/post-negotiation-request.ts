import z from "zod";

export const postNegotiationReviewRequestSchema = z.object({
  runId: z.string().uuid(),
  decision: z.enum(["accept", "decline"]),
  agentFeedback: z.string().optional(),
});

export const postMeetingReflectionRequestSchema = z.object({
  runId: z.string().uuid(),
  text: z.string().min(1, "Reflection cannot be empty"),
});

export type PostNegotiationReviewRequest = z.infer<typeof postNegotiationReviewRequestSchema>;
export type PostMeetingReflectionRequest = z.infer<typeof postMeetingReflectionRequestSchema>;
