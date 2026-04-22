import { expect, test } from "bun:test";
import type { ToolRuntimeContext, ToolSpec } from "@cfd/agent-identity";
import { policy } from "@cfd/agent-identity";
import z from "zod";
import { toolSpecToAiTool } from "./tool-spec-to-ai-sdk.js";

test("toolSpecToAiTool evaluates spec.policies before each execute", async () => {
  let policyEvalCount = 0;
  let allow = true;
  const p = policy("gate", async () => {
    policyEvalCount++;
    return allow;
  });

  const spec: ToolSpec = {
    name: "noop",
    inputSchema: z.object({}).strict(),
    instructions: "",
    policyIds: ["gate"],
    policies: [p],
    handler: async () => "done",
  };

  const runtime: ToolRuntimeContext = { env: {} };
  const aiTool = toolSpecToAiTool(spec, runtime);
  const execute = aiTool.execute;
  if (typeof execute !== "function") {
    throw new Error("expected AI tool execute");
  }

  const toolOpts = { toolCallId: "identity-adapters-policy-test", messages: [] } as never;

  await execute({}, toolOpts);
  expect(policyEvalCount).toBe(1);

  allow = false;
  expect(execute({}, toolOpts)).rejects.toThrow("Policy denied: gate");
  expect(policyEvalCount).toBe(2);
});
