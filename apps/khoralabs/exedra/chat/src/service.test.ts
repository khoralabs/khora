import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createChatClient } from "./client";
import { createChatRoutesWithParams, dispatchChatRoute } from "./routes";
import { closeChatDb, getChatService, resolveExedraChatDbPath } from "./service";
import { interviewChatThreadId, parseSessionChatThreadId, sessionChannelId } from "./thread-ids";

const TEST_TOKEN = "test-chat-token";
let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-chat-service-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.EXEDRA_INTERNAL_TOKEN = TEST_TOKEN;
  delete process.env.CHAT_DB_PATH;
  delete process.env.CHAT_INTERNAL_TOKEN;
  closeChatDb();
});

afterEach(() => {
  closeChatDb();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.EXEDRA_CHAT_DB_PATH;
  delete process.env.EXEDRA_INTERNAL_TOKEN;
  delete process.env.CHAT_DB_PATH;
  delete process.env.CHAT_INTERNAL_TOKEN;
});

function createTestClient() {
  const service = getChatService();
  const routes = createChatRoutesWithParams(service, TEST_TOKEN);
  return createChatClient({
    baseUrl: "http://chat.test",
    token: TEST_TOKEN,
    fetchFn: (req, init) => {
      const request =
        req instanceof Request ? new Request(req, init) : new Request(req.toString(), init);
      return dispatchChatRoute(routes, request);
    },
  });
}

test("persists chat in a dedicated sqlite database", async () => {
  const client = createTestClient();
  const sessionId = "session-1";
  const userId = "user:did:example";
  const channelId = sessionChannelId(sessionId);
  const threadId = interviewChatThreadId(sessionId, userId);

  await client.createChannel({ id: channelId, metadata: { kind: "session", sessionId } });
  await client.createThread({
    id: threadId,
    root: { type: "channel", channelId },
    metadata: { kind: "interview", sessionId, userId },
  });

  expect(resolveExedraChatDbPath()).toContain("exedra-chat.db");
  expect(await client.getThread(threadId)).toMatchObject({ id: threadId });
});

test("parses thread ids for DID users containing colons", () => {
  const userId = "did:plc:abc:def";
  const threadId = interviewChatThreadId("sess-1", userId);
  expect(parseSessionChatThreadId(threadId)).toEqual({
    kind: "interview",
    sessionId: "sess-1",
    userId,
  });
});

test("internal streamed post lifecycle works via routes", async () => {
  const client = createTestClient();
  const sessionId = "session-stream";
  const userId = "user-1";
  const channelId = sessionChannelId(sessionId);
  const threadId = interviewChatThreadId(sessionId, userId);

  await client.createChannel({ id: channelId });
  await client.createThread({
    id: threadId,
    root: { type: "channel", channelId },
    metadata: { kind: "interview", sessionId, userId },
  });

  const started = await client.startStreamedPost({
    threadId,
    author: { type: "agent", id: "exedra-agent" },
    message: { id: "post-1", role: "assistant", parts: [{ type: "text", text: "" }] },
  });

  await client.applyPostDelta({
    postId: started.post.id,
    message: {
      id: started.post.id,
      role: "assistant",
      parts: [{ type: "text", text: "hello from exedra" }],
    },
    expectedRevision: started.revision,
  });

  const completed = await client.completeStreamedPost({
    postId: started.post.id,
    expectedRevision: started.revision + 1,
  });
  expect(completed.post.status).toBe("complete");
});
