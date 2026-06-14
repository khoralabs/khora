import { tool, toolkit } from "@khoralabs/agent-capabilities";
import { z } from "zod";

export type InterviewEnv = {
  sourceMessageId: string;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
};

const flagBeliefTool = tool<"flagBelief", { belief: string }, { queued: true }, InterviewEnv>({
  name: "flagBelief",
  description: "Flag a belief or observation worth confirming with the stakeholder",
  inputSchema: z.object({
    belief: z.string().describe("The belief text to confirm"),
  }),
  handler: async (ctx, input) => {
    ctx.env.onBeliefFlag(input.belief, ctx.env.sourceMessageId);
    return { queued: true };
  },
});

export const interviewToolkit = toolkit([flagBeliefTool], { name: "exedra-interview" });
