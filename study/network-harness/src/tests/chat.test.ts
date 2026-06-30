import { beforeAll, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";

import { createHarnessChat, type HarnessChat } from "../chat";

const dataDir = path.join(os.tmpdir(), `khora-chat-${process.pid}`);
let chat: HarnessChat;

beforeAll(() => {
  chat = createHarnessChat(dataDir);
});

describe("harness chat", () => {
  test("agents create threads, send messages, and grant access", async () => {
    const alice = chat.forAgent("did:alice");
    const bob = chat.forAgent("did:bob");
    const charlie = chat.forAgent("did:charlie");

    const thread = await alice.createThread({
      metadata: { title: "planning" },
      participants: [{ scope: { type: "agent", id: "did:bob" } }],
    });

    await alice.sendMessage(thread.id, { text: "Let's coordinate." });
    await bob.sendMessage(thread.id, { text: "Sounds good." });

    await expect(charlie.sendMessage(thread.id, { text: "Can I join?" })).rejects.toThrow(
      "does not have access",
    );

    await alice.grantAccess(thread.id, { type: "agent", id: "did:charlie" });
    await charlie.sendMessage(thread.id, { text: "Thanks for the invite." });

    const posts = await charlie.listPosts(thread.id);
    expect(posts.items).toHaveLength(3);
    expect(posts.items.map((post) => post.parts[0]?.text)).toEqual([
      "Let's coordinate.",
      "Sounds good.",
      "Thanks for the invite.",
    ]);

    const participants = await alice.listParticipants(thread.id);
    expect(participants).toEqual(
      expect.arrayContaining([
        { type: "agent", id: "did:alice" },
        { type: "agent", id: "did:bob" },
        { type: "agent", id: "did:charlie" },
      ]),
    );

    const aliceThreads = await alice.listThreads();
    expect(aliceThreads.items.map((item) => item.id)).toContain(thread.id);

    const charlieThreads = await charlie.listThreads();
    expect(charlieThreads.items.map((item) => item.id)).toContain(thread.id);
  });

  test("later grants allow new participants to read thread results", async () => {
    const owner = chat.forAgent("did:owner");
    const observer = chat.forAgent("did:observer");

    const thread = await owner.createThread();
    await owner.sendMessage(thread.id, { text: "result: 42", role: "assistant" });

    expect((await observer.listThreads()).items).toHaveLength(0);

    await owner.grantAccess(thread.id, { type: "agent", id: "did:observer" }, "reader");

    const threads = await observer.listThreads();
    expect(threads.items.map((item) => item.id)).toContain(thread.id);

    const posts = await observer.listPosts(thread.id);
    expect(posts.items.some((post) => post.parts[0]?.text === "result: 42")).toBe(true);
  });
});
