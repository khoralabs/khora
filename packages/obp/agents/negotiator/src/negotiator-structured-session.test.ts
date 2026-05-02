import { describe, expect, test } from "bun:test";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from "@ai-sdk/provider";
import { createAgentRegistry } from "@cfd/agent-identity";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import {
  ensureObpNegotiatorStructuredAgentRegistered,
  type ObpNegotiatorStructuredSessionContext,
  type ObpNegotiatorStructuredSessionInput,
  type ObpNegotiatorStructuredSessionOutput,
} from "./negotiator-structured-session.ts";

function modelReturning(json: string): {
  model: MockLanguageModelV3;
  calls: LanguageModelV3CallOptions[];
} {
  const calls: LanguageModelV3CallOptions[] = [];
  const model = new MockLanguageModelV3({
    doGenerate: async (opts): Promise<LanguageModelV3GenerateResult> => {
      calls.push(opts);
      return {
        content: [{ type: "text", text: json }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
  return { model, calls };
}

describe("createObpNegotiatorStructuredSessionRunner", () => {
  test("invokes generateObject with prepared schema + user message and returns parsed output", async () => {
    const registry = createAgentRegistry();
    const { identity } = await ensureObpNegotiatorStructuredAgentRegistered(registry, "stub-test");
    const { model, calls } = modelReturning('{"verdict":"yes"}');

    const session = registry.createSession(identity.agentId, {
      ctx: {
        model,
        prepared: {
          zodOutputSchema: z.object({ verdict: z.string() }),
          systemFragments: ["TURN-FRAGMENT-XYZ"],
          userMessage: "USER-MESSAGE-ABC",
          metadata: { outputName: "Verdict" },
        },
      } as Omit<ObpNegotiatorStructuredSessionContext, "agent">,
    });

    const out = await session.start<
      ObpNegotiatorStructuredSessionInput,
      ObpNegotiatorStructuredSessionOutput
    >({});
    expect(out.output).toEqual({ verdict: "yes" });

    expect(calls.length).toBe(1);
    const sysMsg = calls[0]?.prompt.find((m) => m.role === "system");
    expect(sysMsg).toBeDefined();
    if (sysMsg && sysMsg.role === "system") {
      expect(sysMsg.content).toContain("TURN-FRAGMENT-XYZ");
    }
    const userMsg = calls[0]?.prompt.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    if (userMsg && userMsg.role === "user") {
      const flat = userMsg.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
      expect(flat).toContain("USER-MESSAGE-ABC");
    }
  });

  test("missing prepared schema throws", async () => {
    const registry = createAgentRegistry();
    const { identity } = await ensureObpNegotiatorStructuredAgentRegistered(registry, "stub-empty");
    const { model } = modelReturning("{}");
    const session = registry.createSession(identity.agentId, {
      ctx: {
        model,
        prepared: {
          systemFragments: [],
          userMessage: "x",
        },
      } as Omit<ObpNegotiatorStructuredSessionContext, "agent">,
    });
    await expect(
      session.start<ObpNegotiatorStructuredSessionInput, ObpNegotiatorStructuredSessionOutput>({}),
    ).rejects.toThrow(/zodOutputSchema.*outputSchema/);
  });
});
