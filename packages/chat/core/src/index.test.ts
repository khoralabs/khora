import { describe, expect, test } from "bun:test";
import {
  computeContentHash,
  computeLineageHash,
  createChatService,
  lineageBetween,
} from "@khoralabs/chat-core";
import { createMemoryChatPersistence } from "@khoralabs/chat-persistence";

describe("chat-core", () => {
  test("computes stable content and lineage hashes", () => {
    const contentHash = computeContentHash({
      postId: "p1",
      versionId: "v1",
      threadId: "t1",
      author: { type: "account", id: "u1" },
      role: "user",
      parts: [{ type: "text", text: "hello" }],
      previousPostVersionId: null,
    });
    const lineageHash = computeLineageHash({
      previousLineageHash: null,
      contentHash,
      postId: "p1",
      versionId: "v1",
    });
    expect(contentHash).toHaveLength(64);
    expect(lineageHash).toHaveLength(64);
  });

  test("service appends through persistence", async () => {
    const persistence = createMemoryChatPersistence();
    const service = createChatService(persistence);
    const channel = await service.createChannel({});
    const thread = await service.createThread({
      root: { type: "channel", channelId: channel.id },
    });
    const { post } = await service.appendPost({
      threadId: thread.id,
      author: { type: "account", id: "u1" },
      message: { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
    });
    expect(post.parts[0]).toEqual({ type: "text", text: "hi" });
  });

  test("lineageBetween finds ancestor slice", () => {
    const versions = new Map([
      ["v1", { id: "v1", postId: "a", previousPostVersionId: null }],
      ["v2", { id: "v2", postId: "b", previousPostVersionId: "v1" }],
      ["v3", { id: "v3", postId: "c", previousPostVersionId: "v2" }],
    ]);
    expect(lineageBetween("v3", "v2", versions)?.map((v) => v.postId)).toEqual(["b", "c"]);
  });
});
