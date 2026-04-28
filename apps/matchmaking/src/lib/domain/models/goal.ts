import { z } from "zod";
import { zRunId } from "./ids.ts";

export const zGoal = z.object({
  id: z.uuid(),
  inviteId: zRunId,
  subjectId: z.string().min(1),
  text: z.string().min(1),
  kind: z.string().min(1).optional(),
  priority: z.number().int().optional(),
  createdAt: z.number().int(),
});
export type Goal = z.infer<typeof zGoal>;

export const zCreateGoalInput = z.object({
  text: z.string().min(1),
  kind: z.string().min(1).optional(),
  priority: z.number().int().optional(),
});
export type CreateGoalInput = z.infer<typeof zCreateGoalInput>;
