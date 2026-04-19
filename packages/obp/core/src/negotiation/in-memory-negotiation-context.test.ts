import { describe, expect, test } from "bun:test";
import { InMemoryNegotiationContext } from "./in-memory-negotiation-context.ts";

describe("InMemoryNegotiationContext", () => {
  test("post and withContext returns ordered history", async () => {
    const ctx = new InMemoryNegotiationContext({ partyIds: ["a", "b"] });
    await ctx.postMessage({ authorPartyId: "a", kind: "text", content: "hello" });
    await ctx.postMessage({
      authorPartyId: "b",
      kind: "tool_call",
      content: "obp_extend_offer(...)",
      toolCall: { name: "obp_extend_offer", input: { offerType: "x" }, result: { ok: true } },
    });
    const hist = await ctx.withContext({ forPartyId: "a" });
    expect(hist).toHaveLength(2);
    expect(hist[0]?.kind).toBe("text");
    expect(hist[1]?.toolCall?.name).toBe("obp_extend_offer");
  });

  test("rejects unknown author party", async () => {
    const ctx = new InMemoryNegotiationContext({ partyIds: ["a"] });
    expect(ctx.postMessage({ authorPartyId: "z", kind: "text", content: "nope" })).rejects.toThrow(
      /unknown party/,
    );
  });

  test("withContext rejects unknown forPartyId", async () => {
    const ctx = new InMemoryNegotiationContext({ partyIds: ["a", "b"] });
    expect(ctx.withContext({ forPartyId: "z" })).rejects.toThrow(/unknown party/);
  });
});
