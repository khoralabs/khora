import { expect, test } from "bun:test";
import type { ObpNegotiatorGeneration } from "./create-negotiator-agent.ts";
import { negotiationEndPayloadFromGeneration } from "./negotiation-end-from-generation.ts";

test("negotiationEndPayloadFromGeneration reads successful obp_end_negotiation", () => {
  const generation = {
    steps: [
      {
        toolCalls: [],
        staticToolCalls: [
          {
            toolCallId: "tc1",
            toolName: "obp_end_negotiation",
            input: { reason: "done" },
          },
        ],
        dynamicToolCalls: [],
        staticToolResults: [
          { type: "tool-result" as const, toolCallId: "tc1", output: { ended: true } },
        ],
      },
    ],
  } as unknown as ObpNegotiatorGeneration;

  expect(negotiationEndPayloadFromGeneration(generation)).toEqual({ reason: "done" });
});

test("negotiationEndPayloadFromGeneration ignores tool-error", () => {
  const generation = {
    steps: [
      {
        staticToolCalls: [
          { toolCallId: "tc1", toolName: "obp_end_negotiation", input: { reason: "x" } },
        ],
        staticToolResults: [{ type: "tool-error" as const, toolCallId: "tc1", error: "fail" }],
      },
    ],
  } as unknown as ObpNegotiatorGeneration;

  expect(negotiationEndPayloadFromGeneration(generation)).toBeNull();
});
