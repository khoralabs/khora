import { expect, test } from "bun:test";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import { toolMapToAiTools } from "@khoralabs/agent-capabilities-ai-sdk";

import { interviewToolkit } from "./toolkit.js";

test("flagBelief invokes host callback", async () => {
  const flags: string[] = [];
  const env = {
    sourceMessageId: "msg-1",
    onBeliefFlag: (belief: string, sourceMessageId: string) => {
      flags.push(`${belief}:${sourceMessageId}`);
    },
  };

  const { tools } = await evaluateComposable(interviewToolkit, { env });
  const aiTools = toolMapToAiTools(tools, { env, resolvedPolicies: new Map() });
  const flagBelief = aiTools.flagBelief;
  if (flagBelief === undefined || typeof flagBelief.execute !== "function") {
    throw new Error("expected flagBelief AI tool");
  }

  await flagBelief.execute({ belief: "Users prefer async workflows" }, {
    toolCallId: "flag-belief-test",
    messages: [],
  } as never);

  expect(flags).toEqual(["Users prefer async workflows:msg-1"]);
});
