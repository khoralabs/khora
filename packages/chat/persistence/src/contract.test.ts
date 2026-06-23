import { describe, expect, test } from "bun:test";
import type { ChatPersistence } from "@khoralabs/chat-core";
import { lineageBetween } from "@khoralabs/chat-core";
import { createMemoryChatPersistence } from "./memory-persistence.ts";

export function runChatPersistenceContractTests(
  name: string,
  createPersistence: () => ChatPersistence | Promise<ChatPersistence>,
) {
  describe(`${name} persistence contract`, () => {
    test("creates channel and thread under channel", async () => {
      const persistence = await createPersistence();
      const channel = await persistence.createChannel({ metadata: { name: "general" } });
      const thread = await persistence.createThread({
        root: { type: "channel", channelId: channel.id },
      });

      expect(await persistence.getChannel(channel.id)).toEqual(channel);
      expect(await persistence.getThread(thread.id)).toEqual(thread);
      const threads = await persistence.listThreads({ channelId: channel.id });
      expect(threads.items).toHaveLength(1);
    });

    test("appends posts with monotonic indexes", async () => {
      const persistence = await createPersistence();
      const channel = await persistence.createChannel({});
      const thread = await persistence.createThread({
        root: { type: "channel", channelId: channel.id },
      });
      const author = { type: "account", id: "user-1" };

      const first = await persistence.appendPost({
        threadId: thread.id,
        author,
        message: { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const second = await persistence.appendPost({
        threadId: thread.id,
        author,
        message: { id: "m2", role: "assistant", parts: [{ type: "text", text: "hi" }] },
        expectedHeadPostVersionId: first.head.headPostVersionId,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      const posts = await persistence.listPosts({ threadId: thread.id });
      expect(posts.items).toHaveLength(2);
      expect(posts.items[0]?.index).toBe(1);
      expect(posts.items[1]?.index).toBe(2);
      expect(posts.items[0]?.parts[0]).toEqual({ type: "text", text: "hello" });
    });

    test("returns head conflict on stale append", async () => {
      const persistence = await createPersistence();
      const channel = await persistence.createChannel({});
      const thread = await persistence.createThread({
        root: { type: "channel", channelId: channel.id },
      });
      const author = { type: "account", id: "user-1" };

      const first = await persistence.appendPost({
        threadId: thread.id,
        author,
        message: { id: "m1", role: "user", parts: [{ type: "text", text: "one" }] },
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const conflict = await persistence.appendPost({
        threadId: thread.id,
        author,
        message: { id: "m2", role: "user", parts: [{ type: "text", text: "two" }] },
        expectedHeadPostVersionId: null,
      });
      expect(conflict.ok).toBe(false);
      if (conflict.ok) return;
      expect(conflict.reason).toBe("head_conflict");
    });

    test("supports recursive thread rooted at post", async () => {
      const persistence = await createPersistence();
      const channel = await persistence.createChannel({});
      const parentThread = await persistence.createThread({
        root: { type: "channel", channelId: channel.id },
      });
      const author = { type: "account", id: "user-1" };
      const parentPost = await persistence.appendPost({
        threadId: parentThread.id,
        author,
        message: { id: "root-post", role: "user", parts: [{ type: "text", text: "root" }] },
      });
      expect(parentPost.ok).toBe(true);
      if (!parentPost.ok) return;

      const childThread = await persistence.createThread({
        root: { type: "post", postId: parentPost.post.id },
      });
      const childPosts = await persistence.listThreads({ postId: parentPost.post.id });
      expect(childPosts.items.some((item) => item.id === childThread.id)).toBe(true);
    });

    test("edits create immutable versions and preserve lineage", async () => {
      const persistence = await createPersistence();
      const channel = await persistence.createChannel({});
      const thread = await persistence.createThread({
        root: { type: "channel", channelId: channel.id },
      });
      const author = { type: "account", id: "user-1" };
      const appended = await persistence.appendPost({
        threadId: thread.id,
        author,
        message: { id: "m1", role: "user", parts: [{ type: "text", text: "draft" }] },
      });
      expect(appended.ok).toBe(true);
      if (!appended.ok) return;

      const edited = await persistence.editPost({
        postId: appended.post.id,
        parentVersionId: appended.post.versionId,
        author,
        message: { id: "m1", role: "user", parts: [{ type: "text", text: "final" }] },
      });
      expect(edited.ok).toBe(true);
      if (!edited.ok) return;

      const posts = await persistence.listPosts({ threadId: thread.id });
      expect(posts.items).toHaveLength(1);
      expect(posts.items[0]?.parts[0]).toEqual({ type: "text", text: "final" });
      expect(edited.post.previousVersionId).toBe(appended.post.versionId);
    });

    test("soft delete preserves ledger order", async () => {
      const persistence = await createPersistence();
      const channel = await persistence.createChannel({});
      const thread = await persistence.createThread({
        root: { type: "channel", channelId: channel.id },
      });
      const author = { type: "account", id: "user-1" };
      const first = await persistence.appendPost({
        threadId: thread.id,
        author,
        message: { id: "m1", role: "user", parts: [{ type: "text", text: "keep" }] },
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const second = await persistence.appendPost({
        threadId: thread.id,
        author,
        message: { id: "m2", role: "user", parts: [{ type: "text", text: "remove" }] },
        expectedHeadPostVersionId: first.head.headPostVersionId,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      await persistence.deletePost({ postId: second.post.id });
      const posts = await persistence.listPosts({ threadId: thread.id });
      expect(posts.items).toHaveLength(2);
      expect(posts.items[1]?.deletedAtMs).not.toBeNull();
      expect(posts.items[0]?.index).toBe(1);
      expect(posts.items[1]?.index).toBe(2);
    });

    test("records ACL membership changes", async () => {
      const persistence = await createPersistence();
      const channel = await persistence.createChannel({});
      const actor = { type: "account", id: "admin" };
      const member = { type: "account", id: "member" };

      await persistence.addChannelMember({
        channelId: channel.id,
        scope: member,
        role: "member",
        actor,
      });
      const members = await persistence.listChannelMembers(channel.id);
      expect(members).toEqual([member]);

      const events = await persistence.listAclEvents({ channelId: channel.id });
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("channel.member.added");
    });

    test("supports idempotency keys for append", async () => {
      const persistence = await createPersistence();
      const channel = await persistence.createChannel({});
      const thread = await persistence.createThread({
        root: { type: "channel", channelId: channel.id },
      });
      const author = { type: "account", id: "user-1" };
      const input = {
        threadId: thread.id,
        author,
        idempotencyKey: "retry-1",
        message: {
          id: "m1",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "once" }],
        },
      };
      const first = await persistence.appendPost(input);
      const second = await persistence.appendPost(input);
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.post.versionId).toBe(first.post.versionId);
      const posts = await persistence.listPosts({ threadId: thread.id });
      expect(posts.items).toHaveLength(1);
    });

    test("walks lineage between ancestor and head", async () => {
      const persistence = await createPersistence();
      const channel = await persistence.createChannel({});
      const thread = await persistence.createThread({
        root: { type: "channel", channelId: channel.id },
      });
      const author = { type: "account", id: "user-1" };
      let headVersionId: string | null = null;
      const versions = new Map<
        string,
        { id: string; postId: string; previousPostVersionId?: string | null }
      >();

      for (const text of ["a", "b", "c"]) {
        const result = await persistence.appendPost({
          threadId: thread.id,
          author,
          message: { id: `m-${text}`, role: "user", parts: [{ type: "text", text }] },
          expectedHeadPostVersionId: headVersionId,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        headVersionId = result.head.headPostVersionId;
        const version = await persistence.getPostVersion(result.post.versionId);
        if (version) {
          versions.set(version.id, version);
        }
      }

      const middle = [...versions.values()].find((version) => version.postId === "m-b");
      expect(middle).toBeDefined();
      if (!middle || !headVersionId) return;
      const slice = lineageBetween(headVersionId, middle.id, versions);
      expect(slice?.map((version) => version.postId)).toEqual(["m-b", "m-c"]);
    });
  });
}

runChatPersistenceContractTests("memory", () => createMemoryChatPersistence());
