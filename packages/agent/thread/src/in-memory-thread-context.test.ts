import { describe, expect, test } from "bun:test";
import { InMemoryThreadContext } from "./in-memory-thread-context";
import { postThreadUserText } from "./messages";

describe("InMemoryThreadContext", () => {
  test("post and withContext returns ordered history", async () => {
    const ctx = new InMemoryThreadContext({ participantIds: ["a", "b"] });
    await ctx.postMessage(postThreadUserText("a", "hello"));
    await ctx.postMessage({
      authorId: "b",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "obp_extend_offer",
          toolCallId: "c1",
          state: "output-available",
          input: { offerType: "x" },
          output: { ok: true },
        },
      ],
    });
    const hist = await ctx.withContext({ forParticipantId: "a" });
    expect(hist).toHaveLength(2);
    expect(hist[0]?.metadata.authorId).toBe("a");
    expect(hist[0]?.parts[0]).toEqual({ type: "text", text: "hello", state: "done" });
    expect((hist[1]?.parts[0] as { toolName: string }).toolName).toBe("obp_extend_offer");
  });

  test("rejects unknown author participant", async () => {
    const ctx = new InMemoryThreadContext({ participantIds: ["a"] });
    expect(ctx.postMessage(postThreadUserText("z", "nope"))).rejects.toThrow(/unknown participant/);
  });

  test("withContext rejects unknown forParticipantId", async () => {
    const ctx = new InMemoryThreadContext({ participantIds: ["a", "b"] });
    expect(ctx.withContext({ forParticipantId: "z" })).rejects.toThrow(/unknown participant/);
  });
});
