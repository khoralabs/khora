import { describe, expect, test } from "bun:test";
import type { Post } from "@khoralabs/chat-core";
import { mergePostIntoList, postsToUiMessages, postToUiMessage } from "./client.ts";

describe("chat-react client helpers", () => {
  test("passes through AI SDK compatible posts", () => {
    const post: Post = {
      id: "m1",
      role: "assistant",
      status: "complete",
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

  test("merges streamed post deltas into local list", () => {
    const streaming = {
      id: "m1",
      role: "assistant" as const,
      status: "streaming" as const,
      parts: [{ type: "text" as const, text: "hel", state: "streaming" as const }],
      threadId: "t1",
      author: { type: "agent", id: "a1" },
      index: 1,
      streamRevision: 1,
      createdAtMs: 1,
    };
    const updated = {
      ...streaming,
      parts: [{ type: "text" as const, text: "hello", state: "streaming" as const }],
      streamRevision: 2,
    };
    expect(mergePostIntoList([], streaming)).toEqual([streaming]);
    expect(mergePostIntoList([streaming], updated)).toEqual([updated]);
  });
});
