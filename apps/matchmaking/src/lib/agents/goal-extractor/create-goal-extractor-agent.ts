import type { RegisteredAgentIdentity } from "@khoralabs/agent-identity";
import { generateText, type LanguageModel, Output } from "ai";
import { type GoalExtractionOutput, zGoalExtractionOutput } from "./output.ts";

export async function generateGoalExtractorOutput(args: {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  instructions: string;
  maxSteps?: number;
  message: string;
}): Promise<{ generation: unknown; output: GoalExtractionOutput }> {
  const { model, instructions, maxSteps = 2 } = args;
  const generation = await generateText({
    model,
    prompt: args.message,
    output: Output.object({
      name: "GoalExtraction",
      description: "Structured extraction of explicit goals from invitation text.",
      schema: zGoalExtractionOutput,
    }),
    ...(instructions.trim().length > 0 ? { system: instructions } : {}),
    maxOutputTokens: 800,
    maxRetries: maxSteps,
  });
  return { generation, output: generation.output };
}
