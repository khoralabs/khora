import { policy, tool, toolkit } from "@khoralabs/agent-capabilities";
import { z } from "zod";

export type InterviewEnv = {
  sourceMessageId: string;
  allowBeliefFlag: boolean;
  isOnboarding: boolean;
  allowCompleteOnboarding: boolean;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
  onCompleteOnboarding: (summary: string) => void;
};

const afterFirstUserMessage = policy("after-first-user-message", async (env: InterviewEnv) =>
  Promise.resolve(env.allowBeliefFlag),
);

const afterMinOnboardingTurns = policy("after-min-onboarding-turns", async (env: InterviewEnv) =>
  Promise.resolve(env.isOnboarding && env.allowCompleteOnboarding),
);

const flagBeliefTool = tool<
  "flagBelief",
  { beliefs: string[] },
  { beliefs: string[]; addedToBeliefsPanel: true },
  InterviewEnv
>({
  name: "flagBelief",
  description:
    "Record all testable beliefs, preferences, assumptions, constraints, or decisions inferred from the stakeholder's message. Pass every distinct belief in one call — do not stop at a single belief when their message supports more.",
  inputSchema: z.object({
    beliefs: z
      .array(z.string())
      .min(1)
      .describe("Each distinct testable belief inferred from the message"),
  }),
  policies: [afterFirstUserMessage],
  handler: async (ctx, input) => {
    const beliefs = input.beliefs
      .map((belief) => belief.trim())
      .filter((belief) => belief.length > 0);
    for (const belief of beliefs) {
      ctx.env.onBeliefFlag(belief, ctx.env.sourceMessageId);
    }
    return {
      beliefs,
      addedToBeliefsPanel: true,
    };
  },
});

const completeOnboardingInterviewTool = tool<
  "completeOnboardingInterview",
  { summary: string },
  { completed: true },
  InterviewEnv
>({
  name: "completeOnboardingInterview",
  description:
    "Mark the onboarding interview complete once you have a solid shared understanding of the organization and team. Provide a concise summary of the context gathered — this seeds team and personal memory namespaces.",
  inputSchema: z.object({
    summary: z.string().describe("Concise summary of org and team context gathered"),
  }),
  policies: [afterMinOnboardingTurns],
  handler: async (ctx, input) => {
    ctx.env.onCompleteOnboarding(input.summary);
    return { completed: true };
  },
});

export const interviewToolkit = toolkit([flagBeliefTool, completeOnboardingInterviewTool], {
  name: "exedra-interview",
});
