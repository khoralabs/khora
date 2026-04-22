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
]);

export type MeetingSeedPayload = z.infer<typeof zMeetingSeedPayload>;
