import { tool, toolkit } from "@khoralabs/agent-capabilities";
import { z } from "zod";

export type InterviewEnv = {
  sourceMessageId: string;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
};

const flagBeliefTool = tool<"flagBelief", { belief: string }, { queued: true }, InterviewEnv>({
  name: "flagBelief",
  description:
    "Record a testable belief, preference, assumption, constraint, or decision inferred from the stakeholder's message. Call this whenever they share substantive content you may want to confirm later.",
  inputSchema: z.object({
    belief: z.string().describe("The belief text to confirm"),
  }),
  handler: async (ctx, input) => {
    ctx.env.onBeliefFlag(input.belief, ctx.env.sourceMessageId);
    return { queued: true };
  },
});

export const interviewToolkit = toolkit([flagBeliefTool], { name: "exedra-interview" });
