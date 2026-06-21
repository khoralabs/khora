import { policy, tool, toolkit } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import type { SessionCompletionPayload } from "./session-closing.js";

export type { SessionCompletionPayload };

export type InterviewEnv = {
  sourceMessageId: string;
  allowBeliefFlag: boolean;
  isOnboarding: boolean;
  allowCompleteSession: boolean;
  allowCompleteSessionByTurnCount: boolean;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
  onCompleteSession: (payload: SessionCompletionPayload) => void;
};

const afterFirstUserMessage = policy("after-first-user-message", async (env: InterviewEnv) =>
  Promise.resolve(env.allowBeliefFlag),
);

const sessionNotComplete = policy("session-not-complete", async (env: InterviewEnv) =>
  Promise.resolve(env.allowCompleteSession),
);

const minUserTurnsForComplete = policy("min-user-turns-for-complete", async (env: InterviewEnv) =>
  Promise.resolve(env.allowCompleteSessionByTurnCount),
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

const completeSessionTool = tool<
  "completeSession",
  SessionCompletionPayload,
  { completed: true },
  InterviewEnv
>({
  name: "completeSession",
  description:
    "Mark this interview session complete once you have a solid shared understanding. Provide a concise summary and 2–4 suggested follow-up session topics to explore deeper. Call this before any user-visible reply on the completion turn — do not ask another interview question.",
  inputSchema: z.object({
    summary: z.string().describe("Concise summary of what was learned in this session"),
    nextSessionOptions: z
      .array(z.string())
      .min(2)
      .max(4)
      .describe("2–4 specific follow-up session topics to go deeper"),
  }),
  policies: [sessionNotComplete, minUserTurnsForComplete],
  handler: async (ctx, input) => {
    const summary = input.summary.trim();
    const nextSessionOptions = input.nextSessionOptions
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
    ctx.env.onCompleteSession({ summary, nextSessionOptions });
    return { completed: true };
  },
});

export const interviewToolkit = toolkit([flagBeliefTool, completeSessionTool], {
  name: "exedra-interview",
});
