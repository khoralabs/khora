import { z } from "zod";
import { zRunId } from "./ids.ts";

export const zReflectionKind = z.enum(["post_negotiation_review", "post_meeting"] as const);
export type ReflectionKind = z.infer<typeof zReflectionKind>;

export const zReflection = z.object({
  id: z.uuid(),
  runId: zRunId,
  kind: zReflectionKind,
  decision: z.enum(["accept", "decline"]).optional(),
  agentFeedback: z.string().optional(),
  text: z.string().optional(),
  createdAt: z.number().int(),
});
export type Reflection = z.infer<typeof zReflection>;
