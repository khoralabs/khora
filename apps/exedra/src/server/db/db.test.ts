import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { getOrCreateUser } from "../identity/users";
import { consumeSessionInvite, getInvitePublicInfo, mintSessionInvite } from "./invites";
import { insertMessage, loadThreadMessages } from "./messages";
import { ensureExedraSchema } from "./schema";
import { createOrg, createSession, createTeam } from "./sessions";

beforeAll(() => {
  process.env.INVITE_PEPPER = "test-pepper-for-invites";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

let db: Database;

beforeAll(async () => {
  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterAll(() => {
  db.close();
});

test("session invite is single-use", async () => {
  const user = await getOrCreateUser(db, "registry-user-1");
  const orgId = createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    displayName: "Review",
    topic: "Topic",
    prompt: "Prompt",
    facilitatorId: user.id,
  });

  const token = mintSessionInvite(db, session.id);
  const info = getInvitePublicInfo(db, token);
  expect(info?.status).toBe("pending");

  const consumed = consumeSessionInvite(db, token, user.id);
  expect(consumed?.sessionId).toBe(session.id);

  const infoAfter = getInvitePublicInfo(db, token);
  expect(infoAfter?.status).toBe("accepted");

  const second = consumeSessionInvite(db, token, user.id);
  expect(second).toBeNull();
});

test("messages round-trip as UIMessage JSONB", async () => {
  const user = await getOrCreateUser(db, "registry-user-2");
  const orgId = createOrg(db, { name: "Org2", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team2", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    displayName: "Review",
    topic: "Topic",
    prompt: "Prompt",
    facilitatorId: user.id,
  });

  const threadId = crypto.randomUUID();
  db.run(
    `INSERT INTO threads (id, kind, session_id, user_id, created_at_ms) VALUES (?, 'interview', ?, ?, ?)`,
    [threadId, session.id, user.id, Date.now()],
  );

  insertMessage(db, {
    id: "msg-1",
    threadId,
    role: "user",
    parts: [{ type: "text", text: "hello" }],
    messageIndex: 0,
  });

  const messages = loadThreadMessages(db, threadId);
  expect(messages).toHaveLength(1);
  expect(messages[0]?.parts[0]).toEqual({ type: "text", text: "hello" });
});
