import type { RegisteredAgentIdentity } from "@cfd/agent-identity";
import { generateText, type LanguageModel, Output, type Tool } from "ai";
import {
  type NegotiationSummaryOutput,
  zNegotiationSummaryOutput,
} from "./output.ts";

type NegotiationSummaryToolSet = Record<string, Tool<unknown, unknown>>;

export async function generateNegotiationSummary(args: {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  instructions: string;
  tools: NegotiationSummaryToolSet;
  maxSteps?: number;
  transcript: string;
  partySlug: string;
  counterpartySlug: string;
}): Promise<{ generation: unknown; output: NegotiationSummaryOutput }> {
  const { model, instructions, tools, maxSteps = 6 } = args;
  const prompt = `You are summarizing negotiation outcome for party "${args.partySlug}".
Counterparty slug: "${args.counterpartySlug}".

Negotiation transcript:
${args.transcript}`;
  const generation = await generateText({
    model,
    prompt,
    tools,
    output: Output.object({
      name: "NegotiationSummary",
      description: "Party-specific summary grounded in memory search and transcript evidence.",
      schema: zNegotiationSummaryOutput,
    }),
    ...(instructions.trim().length > 0 ? { system: instructions } : {}),
    maxRetries: maxSteps,
    maxOutputTokens: 1000,
  });
  return { generation, output: generation.output };
}
