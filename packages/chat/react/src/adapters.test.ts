import { describe, expect, test } from "bun:test";
import type { Post } from "@khoralabs/chat-core";
import {
  extractTextFromParts,
  extractToolCallsFromParts,
  formatPostTimestamp,
  guessAttachmentMimeType,
  postsToDisplayMessages,
  postToDisplayMessage,
  toolStateForDisplay,
} from "./adapters.ts";

const basePost = (overrides: Partial<Post> = {}): Post =>
  ({
    id: "post-1",
    threadId: "thread-1",
    role: "user",
    parts: [{ type: "text", text: "Hello" }],
    author: { type: "account", id: "user-1" },
    index: 0,
    createdAtMs: 1_700_000_000_000,
    status: "complete",
    versionId: "v1",
    contentHash: "hash",
    lineageHash: "lineage",
    ...overrides,
  }) as Post;

describe("adapters", () => {
  test("extractTextFromParts joins text parts", () => {
    expect(
      extractTextFromParts([
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ]),
    ).toBe("ab");
  });

  test("extractToolCallsFromParts maps tool states", () => {
    const toolCalls = extractToolCallsFromParts([
      {
        type: "tool-search",
        toolCallId: "tc-1",
        state: "output-available",
        input: { q: "x" },
        output: { ok: true },
      },
    ]);
    expect(toolCalls[0]?.state).toBe("completed");
    expect(toolCalls[0]?.toolName).toBe("search");
  });

  test("postToDisplayMessage skips kickoff metadata", () => {
    expect(
      postToDisplayMessage(
        basePost({ metadata: { kickoff: true }, parts: [{ type: "text", text: "hi" }] }),
      ),
    ).toBeNull();
  });

  test("postToDisplayMessage uses displayText metadata", () => {
    const message = postToDisplayMessage(
      basePost({ metadata: { displayText: "shown" }, parts: [{ type: "text", text: "hidden" }] }),
      { resolveAuthor: () => ({ name: "Zach" }) },
    );
    expect(message?.content).toBe("shown");
    expect(message?.author?.name).toBe("Zach");
  });

  test("postToDisplayMessage keeps empty streaming assistant posts", () => {
    const message = postToDisplayMessage(
      basePost({
        role: "assistant",
        parts: [],
        author: { type: "agent", id: "agent-1" },
        status: "streaming",
        streamRevision: 1,
      }),
    );

    expect(message?.content).toBe("");
    expect(message?.status).toBe("streaming");
  });

  test("postsToDisplayMessages filters null entries", () => {
    const messages = postsToDisplayMessages([
      basePost(),
      basePost({ id: "kickoff", metadata: { kickoff: true } }),
    ]);
    expect(messages).toHaveLength(1);
  });

  test("formatPostTimestamp returns a non-empty label", () => {
    expect(formatPostTimestamp(1_700_000_000_000).length).toBeGreaterThan(0);
  });

  test("guessAttachmentMimeType handles common extensions", () => {
    expect(guessAttachmentMimeType("photo.jpg")).toBe("image/jpeg");
    expect(guessAttachmentMimeType("notes.md")).toBe("text/markdown");
  });

  test("toolStateForDisplay maps ai sdk states", () => {
    expect(toolStateForDisplay("output-available")).toBe("completed");
    expect(toolStateForDisplay("output-error")).toBe("error");
    expect(toolStateForDisplay("input-available")).toBe("running");
  });
});
