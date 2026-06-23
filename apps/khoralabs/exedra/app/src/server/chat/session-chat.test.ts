import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closeDb, getDb, resolveExedraDbPath } from "../db/index";
import { createOrg, createSession, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { closeChatDb, resolveExedraChatDbPath } from "./service";
import { ensureFacilitationChatThread, ensureInterviewChatThread } from "./session-chat";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-chat-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
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

  expect(interview.chatThread.id).toBe(`session:${session.id}:interview:${user.id}`);
  expect(facilitation.chatThread.id).toBe(`session:${session.id}:facilitation`);
  expect(resolveExedraChatDbPath()).not.toBe(resolveExedraDbPath());
});
