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

const flagBeliefTool = tool<"flagBelief", { belief: string }, { queued: true }, InterviewEnv>({
  name: "flagBelief",
  description:
    "Record a testable belief, preference, assumption, constraint, or decision inferred from the stakeholder's message. Call this whenever they share substantive content you may want to confirm later.",
  inputSchema: z.object({
    belief: z.string().describe("The belief text to confirm"),
  }),
  policies: [afterFirstUserMessage],
  handler: async (ctx, input) => {
    ctx.env.onBeliefFlag(input.belief, ctx.env.sourceMessageId);
    return { queued: true };
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
