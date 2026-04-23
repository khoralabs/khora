import z from "zod";

export const zMeetingSeedPayload = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("meeting_intent"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("meeting_invite"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("meeting_reflection"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("meeting_post_negotiation_review"),
    decision: z.enum(["accept", "decline"]),
    /** How well the user’s agent represented them; optional in the product flow. */
    agentFeedback: z.string().optional(),
  }),
]);

export type MeetingSeedPayload = z.infer<typeof zMeetingSeedPayload>;
