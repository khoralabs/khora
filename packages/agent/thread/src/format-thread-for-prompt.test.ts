import { describe, expect, test } from "bun:test";
import { formatThreadForPlaintext } from "./format-thread-for-prompt";
import type { ThreadMessage } from "./messages";

describe("formatThreadForPlaintext", () => {
  test("empty history", () => {
    const out = formatThreadForPlaintext([], new Map([["a", "Alice"]]));
    expect(out).toBe("(no messages yet)");
  });

  test("text and tool lines", () => {
    const messages: ThreadMessage[] = [
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "hi", state: "done" }],
        metadata: { authorId: "a", ts: 1 },
      },
      {
        id: "2",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "obp_foo",
            toolCallId: "x",
            state: "output-available",
            input: { n: 1 },
            output: { ok: true },
          },
        ],
        metadata: { authorId: "b", ts: 2 },
      },
    ];
    const map = new Map<string, string>([
      ["a", "A"],
      ["b", "B"],
    ]);
    const out = formatThreadForPlaintext(messages, map);
    expect(out).toContain("[text] A: hi");
    expect(out).toContain('[tool] B: obp_foo => {"ok":true}');
  });
});
