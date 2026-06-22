import { policy, tool, toolkit } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import type { SessionCompletionPayload } from "./session-closing.js";

export type { SessionCompletionPayload };

export type InterviewMemorySearchHit = {
  source: "org" | "personal";
  key: string;
  snippet: string;
};

export type InterviewEnv = {
  sourceMessageId: string;
  allowBeliefFlag: boolean;
  isOnboarding: boolean;
  allowCompleteSession: boolean;
  allowCompleteSessionByTurnCount: boolean;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
  onCompleteSession: (payload: SessionCompletionPayload) => void;
  searchOrgMemories?: (query: string) => Promise<InterviewMemorySearchHit[]>;
  searchPersonalMemories?: (query: string) => Promise<InterviewMemorySearchHit[]>;
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

const orgMemorySearchEnabled = policy("org-memory-search-enabled", async (env: InterviewEnv) =>
  Promise.resolve(env.searchOrgMemories !== undefined),
);

const personalMemorySearchEnabled = policy(
  "personal-memory-search-enabled",
  async (env: InterviewEnv) => Promise.resolve(env.searchPersonalMemories !== undefined),
);

const searchOrgMemoriesTool = tool<
  "searchOrgMemories",
  { query: string },
  { hits: InterviewMemorySearchHit[] },
  InterviewEnv
>({
  name: "searchOrgMemories",
  description:
    "Search organization and team knowledge for this session. Use when you need prior org or team context not already in the conversation.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Natural language search query"),
  }),
  policies: [orgMemorySearchEnabled],
  handler: async (ctx, input) => {
    const hits = (await ctx.env.searchOrgMemories?.(input.query.trim())) ?? [];
    return { hits };
  },
});

const searchSessionPersonalMemoriesTool = tool<
  "searchSessionPersonalMemories",
  { query: string },
  { hits: InterviewMemorySearchHit[] },
  InterviewEnv
>({
  name: "searchSessionPersonalMemories",
  description:
    "Search the participant's personal memories scoped to this session. Only available when the participant granted access.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Natural language search query"),
  }),
  policies: [personalMemorySearchEnabled],
  handler: async (ctx, input) => {
    const hits = (await ctx.env.searchPersonalMemories?.(input.query.trim())) ?? [];
    return { hits };
  },
});

const flagBeliefTool = tool<
  "flagBelief",
  { beliefs: string[] },
  { beliefs: string[]; addedToBeliefsPanel: true },
  InterviewEnv
>({
  name: "flagBelief",
  description:
    "Record all testable beliefs, preferences, assumptions, constraints, or decisions inferred from the stakeholder's message. Pass every distinct belief in one call — do not stop at a single belief when their message supports more. Do not store redundant beliefs. Every belief should be completely self contained and not rely on other beliefs to be understood.",
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

export const interviewToolkit = toolkit(
  [flagBeliefTool, completeSessionTool, searchOrgMemoriesTool, searchSessionPersonalMemoriesTool],
  {
    name: "exedra-interview",
  },
);
