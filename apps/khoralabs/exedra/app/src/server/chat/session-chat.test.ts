import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { grantSessionCreatorAccess } from "../authz";
import { closeDb, getDb, resolveExedraDbPath } from "../db/index";
import { createOrg, createSession, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { orgSessionScope } from "../memories/namespaces";
import { handleAppendChatPost, handleListChatPosts } from "./routes";
import { closeChatDb, resolveExedraChatDbPath } from "./service";
import { ensureFacilitationChatThread, ensureInterviewChatThread } from "./session-chat";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-chat-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.EXEDRA_INTERNAL_TOKEN = "test-internal-token";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  closeDb();
  closeChatDb();
});

afterEach(() => {
  closeChatDb();
  closeDb();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.EXEDRA_CHAT_DB_PATH;
  delete process.env.EXEDRA_INTERNAL_TOKEN;
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("bootstraps interview and facilitation chat threads in a separate sqlite database", async () => {
  const db = getDb();
  const user = await getOrCreateUser(db, "registry-chat-user");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, { teamId, topic: "Chat integration" });

  const interview = await ensureInterviewChatThread({ db, sessionId: session.id, userId: user.id });
  const facilitation = await ensureFacilitationChatThread({ db, sessionId: session.id });
  const existingInterview = await ensureInterviewChatThread({
    db,
    sessionId: session.id,
    userId: user.id,
  });

  expect(interview.chatThread.id).toBe(`session:${session.id}:interview:${user.id}`);
  expect(interview.created).toBe(true);
  expect(existingInterview.created).toBe(false);
  expect(facilitation.chatThread.id).toBe(`session:${session.id}:facilitation`);
  expect(resolveExedraChatDbPath()).not.toBe(resolveExedraDbPath());
});

test("authorizes interview chat thread ids for DID users containing colons", async () => {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-did-user" } },
      response: null,
    }),
  }));

  const db = getDb();
  const user = await getOrCreateUser(db, "registry-did-user");
  expect(user.id).toContain(":");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, { teamId, topic: "DID chat auth" });
  const interview = await ensureInterviewChatThread({ db, sessionId: session.id, userId: user.id });

  const res = await handleListChatPosts(
    new Request("http://localhost/api/chat/posts"),
    interview.chatThread.id,
  );

  expect(res.status).toBe(200);
});

test("facilitation chat append does not auto-dispatch an agent response", async () => {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-facilitation-user" } },
      response: null,
    }),
  }));

  const db = getDb();
  const user = await getOrCreateUser(db, "registry-facilitation-user");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, { teamId, topic: "Facilitation chat" });
  grantSessionCreatorAccess(db, user.id, session.id);
  const facilitation = await ensureFacilitationChatThread({ db, sessionId: session.id });

  delete process.env.RENDER_API_KEY;
  const res = await handleAppendChatPost(
    new Request("http://localhost/api/chat/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          id: "message-1",
          role: "user",
          parts: [{ type: "text", text: "Hello facilitators" }],
        },
      }),
    }),
    facilitation.chatThread.id,
  );

  expect(res.status).toBe(200);
});

test("internal chat streamed post route starts a stream via dispatcher", async () => {
  const db = getDb();
  const user = await getOrCreateUser(db, "registry-internal-chat-user");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, { teamId, topic: "Internal chat route" });
  const interview = await ensureInterviewChatThread({ db, sessionId: session.id, userId: user.id });
  const { dispatchApiRoute } = await import("../dispatch-api");

  const res = await dispatchApiRoute(
    new Request("http://localhost/internal/chat/streamed-posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-internal-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        author: { type: "agent", id: "agent-1" },
        message: { id: "assistant-1", role: "assistant", parts: [] },
        threadId: interview.chatThread.id,
      }),
    }),
  );

  expect(res?.status).toBe(200);
});

test("internal chat streamed post route accepts encoded thread id path", async () => {
  const db = getDb();
  const user = await getOrCreateUser(db, "registry-internal-chat-path-user");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, { teamId, topic: "Internal chat path route" });
  const interview = await ensureInterviewChatThread({ db, sessionId: session.id, userId: user.id });
  const { dispatchApiRoute } = await import("../dispatch-api");

  const res = await dispatchApiRoute(
    new Request(
      `http://localhost/internal/chat/threads/${encodeURIComponent(interview.chatThread.id)}/streamed-posts`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-internal-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          author: { type: "agent", id: "agent-1" },
          message: { id: "assistant-path-1", role: "assistant", parts: [] },
        }),
      },
    ),
  );

  expect(res?.status).toBe(200);
});

test("internal authz decide route authorizes app-supplied workflow resources", async () => {
  const db = getDb();
  const user = await getOrCreateUser(db, "registry-authz-route-user");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, { teamId, topic: "Internal authz route" });
  const { dispatchApiRoute } = await import("../dispatch-api");

  const res = await dispatchApiRoute(
    new Request("http://localhost/internal/authz/decide", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-internal-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: { type: "agent", id: orgId },
        action: "memory.read",
        resource: {
          namespace: orgSessionScope(orgId, teamId, session.id),
          resourceType: "session",
          resourceId: session.id,
        },
      }),
    }),
  );

  expect(res?.status).toBe(200);
  expect(await res?.json()).toEqual({ allowed: true });
});
