import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeChatDb } from "@khoralabs/exedra-chat";
import { serve } from "bun";

import { grantSessionCreatorAccess } from "../authz";
import { closeDb, getDb } from "../db/index";
import { createOrg, createSession, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { ensureInterviewChatThread } from "./session-chat";
import { uninstallTestChatService } from "./test-service";
import { chatWebSocketHandlers, handleChatThreadWebSocketUpgrade } from "./websocket";

let dataDir: string;
let server: ReturnType<typeof serve> | undefined;

beforeEach(async () => {
  const { mock } = await import("bun:test");
  mock.restore();
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-chat-ws-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.EXEDRA_INTERNAL_TOKEN = "test-internal-token";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  closeDb();
  closeChatDb();
  uninstallTestChatService();

  server = serve({
    port: 0,
    fetch: async (req, bunServer) => {
      const wsResponse = await handleChatThreadWebSocketUpgrade(req, bunServer);
      if (wsResponse !== undefined) return wsResponse;
      return new Response("Not found", { status: 404 });
    },
    websocket: chatWebSocketHandlers,
  });
});

afterEach(async () => {
  const { mock } = await import("bun:test");
  mock.restore();
  server?.stop(true);
  server = undefined;
  closeChatDb();
  closeDb();
  uninstallTestChatService();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.EXEDRA_CHAT_DB_PATH;
  delete process.env.EXEDRA_INTERNAL_TOKEN;
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("rejects websocket upgrade without session auth", async () => {
  const res = await fetch(
    `http://localhost:${server?.port}/ws/chat/threads/session%3A1%3Ainterview%3Au1`,
    {
      headers: { Upgrade: "websocket", Connection: "Upgrade" },
    },
  );
  expect(res.status).toBeGreaterThanOrEqual(400);
});

test("authorized websocket receives chat events", async () => {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySession: async () => ({ user: { id: "registry-ws-user" } }),
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-ws-user" } },
      response: null,
    }),
  }));

  const db = getDb();
  const user = await getOrCreateUser(db, "registry-ws-user");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, { teamId, topic: "WS chat" });
  await grantSessionCreatorAccess(user.id, session.id);
  const interview = await ensureInterviewChatThread({
    db,
    sessionId: session.id,
    userId: user.id,
  });

  const ws = new WebSocket(
    `ws://localhost:${server?.port}/ws/chat/threads/${encodeURIComponent(interview.chatThread.id)}`,
  );
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("websocket failed to open"));
  });

  const eventPromise = new Promise<unknown>((resolve) => {
    ws.onmessage = (message) => resolve(JSON.parse(String(message.data)));
  });

  const { getChatServiceClient } = await import("./service-client");
  await getChatServiceClient().appendPost({
    threadId: interview.chatThread.id,
    author: { type: "account", id: user.id },
    message: {
      id: "message-ws-1",
      role: "user",
      parts: [{ type: "text", text: "hello websocket" }],
    },
  });

  const event = await eventPromise;
  expect(event).toMatchObject({
    type: "post.appended",
    threadId: interview.chatThread.id,
  });
  ws.close();
});

test("rejects websocket upgrade for forbidden thread", async () => {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySession: async () => ({ user: { id: "registry-forbidden-user" } }),
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-forbidden-user" } },
      response: null,
    }),
  }));

  const db = getDb();
  const owner = await getOrCreateUser(db, "registry-owner-user");
  const viewer = await getOrCreateUser(db, "registry-forbidden-user");
  const orgId = await createOrg(db, { name: "Org", ownerId: owner.id });
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: owner.id });
  const session = createSession(db, { teamId, topic: "Forbidden WS" });
  await grantSessionCreatorAccess(owner.id, session.id);
  const interview = await ensureInterviewChatThread({
    db,
    sessionId: session.id,
    userId: owner.id,
  });

  const res = await fetch(
    `http://localhost:${server?.port}/ws/chat/threads/${encodeURIComponent(interview.chatThread.id)}`,
    {
      headers: { Upgrade: "websocket", Connection: "Upgrade" },
    },
  );
  expect(res.status).toBe(403);
  expect(viewer.id).not.toBe(owner.id);
});
