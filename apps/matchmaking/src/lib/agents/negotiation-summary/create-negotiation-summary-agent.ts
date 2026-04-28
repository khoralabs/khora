import { generateObject, type LanguageModel } from "ai";
import { type NegotiationSummaryOutput, zNegotiationSummaryOutput } from "./output.ts";

export async function generateNegotiationSummary(args: {
  model: LanguageModel;
  systemInstructions: string;
  memoryContextBlock: string;
  transcript: string;
  partySlug: string;
  counterpartySlug: string;
}): Promise<{ generation: unknown; output: NegotiationSummaryOutput }> {
  const prompt = [
    `Summarize the negotiation outcome for party "${args.partySlug}".`,
    `Counterparty slug: "${args.counterpartySlug}".`,
    "",
    args.memoryContextBlock,
    "",
    "Negotiation transcript:",
    args.transcript,
    "",
    "Produce a concise summary: main outcome, fit assessment, bullet key evidence (from transcript and memories above), optional recommended next step.",
  ].join("\n");

  const { object } = await generateObject({
    model: args.model,
    schema: zNegotiationSummaryOutput,
    ...(args.systemInstructions.trim().length > 0 ? { system: args.systemInstructions } : {}),
    prompt,
    maxOutputTokens: 1500,
  });

  return { generation: null, output: object };
}
