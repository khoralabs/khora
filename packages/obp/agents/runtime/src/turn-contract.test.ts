import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { PreparedTurn, TurnContract } from "./turn-contract.ts";

describe("PreparedTurn / TurnContract structural shape", () => {
  test("structured prepared turn carries Zod schema + user message + system fragments", () => {
    const schema = z.object({ ok: z.boolean() });
    const prep: PreparedTurn<{ ok: boolean }> = {
      kind: "structured",
      zodOutputSchema: schema,
      systemFragments: ["frag-1", "frag-2"],
      userMessage: "hello",
      metadata: { outputName: "Hello" },
    };
    expect(prep.kind).toBe("structured");
    expect(prep.zodOutputSchema).toBe(schema);
    expect(prep.systemFragments.length).toBe(2);
    expect(prep.userMessage).toBe("hello");
    expect(prep.metadata?.outputName).toBe("Hello");
    expect(prep.allowedToolNames).toBeUndefined();
  });

  test("tool-loop prepared turn carries allowed tool names instead of schema", () => {
    const prep: PreparedTurn<unknown> = {
      kind: "tool-loop",
      allowedToolNames: ["obp_extend_offer", "obp_bind_port"],
      systemFragments: [],
      userMessage: "make a move",
    };
    expect(prep.kind).toBe("tool-loop");
    expect(prep.allowedToolNames?.length).toBe(2);
    expect(prep.zodOutputSchema).toBeUndefined();
  });

  test("contract is a structural interface implementable inline", async () => {
    const contract: TurnContract<{ kind: "noop"; partyId: string }> = {
      async prepare(partyId) {
        return {
          kind: "structured",
          zodOutputSchema: z.object({ pass: z.literal(true) }),
          systemFragments: [],
          userMessage: `for ${partyId}`,
        };
      },
      async apply(partyId, _raw) {
        return { kind: "noop", partyId };
      },
    };
    const prep = await contract.prepare("p-1");
    expect(prep.userMessage).toContain("p-1");
    const audit = await contract.apply("p-2", {});
    expect(audit).toEqual({ kind: "noop", partyId: "p-2" });
  });
});
