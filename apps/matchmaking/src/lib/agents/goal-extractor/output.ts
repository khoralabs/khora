import { z } from "zod";

export const zGoalExtractionGoal = z.object({
  text: z.string().min(1),
  kind: z.string().min(1).optional(),
  priority: z.number().int().optional(),
});

export const zGoalExtractionOutput = z.object({
  goals: z.array(zGoalExtractionGoal),
});

export type GoalExtractionOutput = z.infer<typeof zGoalExtractionOutput>;
