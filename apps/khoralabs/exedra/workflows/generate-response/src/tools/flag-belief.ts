import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import type { GenerateResponseToolkitEnv } from "./types.ts";

const flagBeliefInstructions = [
  "Record testable beliefs, preferences, assumptions, constraints, or decisions inferred from the user's message.",
  "Pass every distinct belief in one call; do not stop at a single belief when the message supports more.",
  "Include implied beliefs, not just the headline takeaway.",
  "After the user shares substantive content, flag all inferrable beliefs before asking your next question.",
  "If the user only asks a question or shares no testable belief, omit this tool call.",
  "Do not store redundant beliefs.",
  "Every belief must be completely self-contained and understandable outside the current chat.",
].join(" ");

function uniqueBeliefs(beliefs: string[]): string[] {
  return [...new Set(beliefs.map((belief) => belief.trim()).filter((belief) => belief.length > 0))];
}

function beliefIntegrationNamespaces(env: GenerateResponseToolkitEnv): string[] {
  return env.policyState.memoryNamespaces
    .filter((namespace) => namespace.scope === "session" || namespace.scope === "personal")
    .map((namespace) => namespace.namespace);
}

export const flagBeliefTool = tool<
  "flagBelief",
  { beliefs: string[] },
  {
    beliefs: string[];
    sourceMessageId?: string;
    addedToBeliefsPanel: boolean;
    integrationNamespaces: string[];
  },
  GenerateResponseToolkitEnv
>({
  name: "flagBelief",
  description: flagBeliefInstructions,
  inputSchema: z.object({
    beliefs: z
      .array(z.string())
      .min(1)
      .describe(
        "Every distinct testable belief inferred from the user's latest substantive message.",
      ),
  }),
  handler: async (ctx, input) => {
    const beliefs = uniqueBeliefs(input.beliefs);
    const sourceMessageId = ctx.env.sourceUserMessageId;
    if (beliefs.length === 0 || sourceMessageId === undefined) {
      return {
        beliefs: [],
        addedToBeliefsPanel: false,
        integrationNamespaces: beliefIntegrationNamespaces(ctx.env),
      };
    }

    for (const belief of beliefs) {
      ctx.env.beliefFlags.push({ belief, messageId: sourceMessageId });
    }

    return {
      beliefs,
      sourceMessageId,
      addedToBeliefsPanel: true,
      integrationNamespaces: beliefIntegrationNamespaces(ctx.env),
    };
  },
});
