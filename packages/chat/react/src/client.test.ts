import { describe, expect, test } from "bun:test";
import type { Post } from "@khoralabs/chat-core";
import { postsToUiMessages, postToUiMessage } from "./client.ts";

describe("chat-react client helpers", () => {
  test("passes through AI SDK compatible posts", () => {
    const post: Post = {
      id: "m1",
      role: "assistant",
      parts: [
        { type: "text", text: "hello" },
        { type: "reasoning", text: "thinking", state: "done" },
      ],
      threadId: "t1",
      author: { type: "agent", id: "a1" },
      versionId: "v1",
      contentHash: "hash",
      lineageHash: "lineage",
      index: 1,
      createdAtMs: 1,
    };
    expect(postToUiMessage(post)).toBe(post);
    expect(postsToUiMessages([post])).toEqual([post]);
  });
});
