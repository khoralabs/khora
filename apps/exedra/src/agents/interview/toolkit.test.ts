import { expect, test } from "bun:test";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import { toolMapToAiTools } from "@khoralabs/agent-capabilities-ai-sdk";

import { type InterviewEnv, interviewToolkit } from "./toolkit.js";

const baseEnv: InterviewEnv = {
  sourceMessageId: "msg-1",
  allowBeliefFlag: false,
  isOnboarding: false,
  allowCompleteSession: true,
  allowCompleteSessionByTurnCount: true,
  onBeliefFlag: (belief: string, sourceMessageId: string) => {
    void belief;
    void sourceMessageId;
  },
  onCompleteSession: (payload) => {
    void payload;
  },
};

function env(overrides: Partial<InterviewEnv>): InterviewEnv {
  return { ...baseEnv, ...overrides };
}

test("flagBelief invokes host callback when allowed", async () => {
  const flags: string[] = [];
  const runtimeEnv = env({
    allowBeliefFlag: true,
    onBeliefFlag: (belief: string, sourceMessageId: string) => {
      flags.push(`${belief}:${sourceMessageId}`);
    },
  });

  const { tools } = await evaluateComposable(interviewToolkit, { env: runtimeEnv });
  expect(Object.keys(tools)).toContain("flagBelief");

  const aiTools = toolMapToAiTools(tools, { env: runtimeEnv, resolvedPolicies: new Map() });
  const flagBelief = aiTools.flagBelief;
  if (flagBelief === undefined || typeof flagBelief.execute !== "function") {
    throw new Error("expected flagBelief AI tool");
  }

  await flagBelief.execute({ beliefs: ["Users prefer async workflows"] }, {
    toolCallId: "flag-belief-test",
    messages: [],
  } as never);

  expect(flags).toEqual(["Users prefer async workflows:msg-1"]);
});

test("flagBelief invokes host callback for each belief", async () => {
  const flags: string[] = [];
  const runtimeEnv = env({
    allowBeliefFlag: true,
    onBeliefFlag: (belief: string, sourceMessageId: string) => {
      flags.push(`${belief}:${sourceMessageId}`);
    },
  });

  const { tools } = await evaluateComposable(interviewToolkit, { env: runtimeEnv });
  const aiTools = toolMapToAiTools(tools, { env: runtimeEnv, resolvedPolicies: new Map() });
  const flagBelief = aiTools.flagBelief;
  if (flagBelief === undefined || typeof flagBelief.execute !== "function") {
    throw new Error("expected flagBelief AI tool");
  }

  await flagBelief.execute(
    {
      beliefs: [
        "The team ships weekly",
        "Quality is prioritized over speed",
        "Design reviews happen async",
      ],
    },
    {
      toolCallId: "flag-belief-multi-test",
      messages: [],
    } as never,
  );

  expect(flags).toEqual([
    "The team ships weekly:msg-1",
    "Quality is prioritized over speed:msg-1",
    "Design reviews happen async:msg-1",
  ]);
});

test("flagBelief is excluded before the user's first real message", async () => {
  const { tools } = await evaluateComposable(interviewToolkit, {
    env: env({ allowBeliefFlag: false }),
  });
  expect(Object.keys(tools)).not.toContain("flagBelief");
});

test("completeSession is excluded until min turns on onboarding sessions", async () => {
  const { tools } = await evaluateComposable(interviewToolkit, {
    env: env({
      isOnboarding: true,
      allowCompleteSession: true,
      allowCompleteSessionByTurnCount: false,
    }),
  });
  expect(Object.keys(tools)).not.toContain("completeSession");
});

test("completeSession is excluded until min turns on standard sessions", async () => {
  const { tools } = await evaluateComposable(interviewToolkit, {
    env: env({
      isOnboarding: false,
      allowCompleteSession: true,
      allowCompleteSessionByTurnCount: false,
    }),
  });
  expect(Object.keys(tools)).not.toContain("completeSession");
});

test("completeSession is available on standard sessions after min turns", async () => {
  const { tools } = await evaluateComposable(interviewToolkit, {
    env: env({
      isOnboarding: false,
      allowCompleteSession: true,
      allowCompleteSessionByTurnCount: true,
    }),
  });
  expect(Object.keys(tools)).toContain("completeSession");
});

test("completeSession invokes host callback with summary and next session options", async () => {
  const completed = { summary: "", nextSessionOptions: [] as string[] };
  const runtimeEnv = env({
    isOnboarding: true,
    allowCompleteSession: true,
    allowCompleteSessionByTurnCount: true,
    onCompleteSession: (payload) => {
      completed.summary = payload.summary;
      completed.nextSessionOptions = payload.nextSessionOptions;
    },
  });

  const { tools } = await evaluateComposable(interviewToolkit, { env: runtimeEnv });
  const aiTools = toolMapToAiTools(tools, { env: runtimeEnv, resolvedPolicies: new Map() });
  const complete = aiTools.completeSession;
  if (complete === undefined || typeof complete.execute !== "function") {
    throw new Error("expected completeSession AI tool");
  }

  await complete.execute(
    {
      summary: "Acme builds widgets for enterprise teams.",
      nextSessionOptions: ["Roadmap priorities", "Release cadence"],
    },
    {
      toolCallId: "complete-session-test",
      messages: [],
    } as never,
  );

  expect(completed.summary).toBe("Acme builds widgets for enterprise teams.");
  expect(completed.nextSessionOptions).toEqual(["Roadmap priorities", "Release cadence"]);
});

test("completeSession is excluded when session is already complete", async () => {
  const { tools } = await evaluateComposable(interviewToolkit, {
    env: env({
      allowCompleteSession: false,
      allowCompleteSessionByTurnCount: true,
    }),
  });
  expect(Object.keys(tools)).not.toContain("completeSession");
});
