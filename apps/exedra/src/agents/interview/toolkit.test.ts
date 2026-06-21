import { expect, test } from "bun:test";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import { toolMapToAiTools } from "@khoralabs/agent-capabilities-ai-sdk";

import { type InterviewEnv, interviewToolkit } from "./toolkit.js";

const baseEnv: InterviewEnv = {
  sourceMessageId: "msg-1",
  allowBeliefFlag: false,
  isOnboarding: false,
  allowCompleteOnboarding: false,
  onBeliefFlag: (belief: string, sourceMessageId: string) => {
    void belief;
    void sourceMessageId;
  },
  onCompleteOnboarding: (summary: string) => {
    void summary;
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

test("completeOnboardingInterview is excluded until min turns on onboarding sessions", async () => {
  const { tools } = await evaluateComposable(interviewToolkit, {
    env: env({
      isOnboarding: true,
      allowCompleteOnboarding: false,
    }),
  });
  expect(Object.keys(tools)).not.toContain("completeOnboardingInterview");
});

test("completeOnboardingInterview invokes host callback when allowed", async () => {
  const completed = { summary: "" };
  const runtimeEnv = env({
    isOnboarding: true,
    allowCompleteOnboarding: true,
    onCompleteOnboarding: (summary: string) => {
      completed.summary = summary;
    },
  });

  const { tools } = await evaluateComposable(interviewToolkit, { env: runtimeEnv });
  expect(Object.keys(tools)).toContain("completeOnboardingInterview");

  const aiTools = toolMapToAiTools(tools, { env: runtimeEnv, resolvedPolicies: new Map() });
  const complete = aiTools.completeOnboardingInterview;
  if (complete === undefined || typeof complete.execute !== "function") {
    throw new Error("expected completeOnboardingInterview AI tool");
  }

  await complete.execute({ summary: "Acme builds widgets for enterprise teams." }, {
    toolCallId: "complete-onboarding-test",
    messages: [],
  } as never);

  expect(completed.summary).toBe("Acme builds widgets for enterprise teams.");
});

test("completeOnboardingInterview is excluded on standard sessions", async () => {
  const { tools } = await evaluateComposable(interviewToolkit, {
    env: env({
      isOnboarding: false,
      allowCompleteOnboarding: true,
    }),
  });
  expect(Object.keys(tools)).not.toContain("completeOnboardingInterview");
});
