import { Database } from "bun:sqlite";
import { afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeChatDb } from "@khoralabs/exedra-chat";
import { interviewChatThreadId, sessionChannelId } from "@khoralabs/exedra-chat/thread-ids";
import { createIsolatedAuthzDatabase, installTestAuthzService } from "../authz/test-service";

import { getChatServiceClient } from "../chat/service-client";
import { uninstallTestChatService } from "../chat/test-service";
import { getOrCreateUser } from "../identity/users";
import { ensureExedraSchema } from "./schema";
import { formatDaysToDeadline, getInterviewStatus, sessionPhaseFromStatus } from "./session-detail";
import { createOrg, createSession, createTeam } from "./sessions";

beforeAll(() => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

afterEach(() => {
  closeChatDb();
  uninstallTestChatService();
  delete process.env.EXEDRA_DATA_DIR;
});

test("formatDaysToDeadline shows <1 day when under 24 hours remain", () => {
  const now = Date.UTC(2026, 5, 14, 12, 0, 0);
  const deadline = now + 6 * 60 * 60 * 1000;
  expect(formatDaysToDeadline(deadline, now)).toBe("<1 day");
  expect(formatDaysToDeadline(deadline + 24 * 60 * 60 * 1000, now)).toBe("2 days");
});

test("sessionPhaseFromStatus maps alignment and individual phases", () => {
  expect(sessionPhaseFromStatus("active")).toBe("individual");
  expect(sessionPhaseFromStatus("alignment")).toBe("alignment");
  expect(sessionPhaseFromStatus("closed")).toBe("closed");
});

test("getInterviewStatus tracks thread and messages", async () => {
  const authzDb = createIsolatedAuthzDatabase();
  installTestAuthzService(authzDb);
  process.env.EXEDRA_DATA_DIR = mkdtempSync(path.join(tmpdir(), "exedra-status-test-"));
  const db = new Database(":memory:");
  ensureExedraSchema(db);
  const user = await getOrCreateUser(db, "registry-interview-status");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Review",
  });

  expect(await getInterviewStatus(db, session.id, user.id)).toBe("not_started");

  const chat = getChatServiceClient();
  await chat.createChannel({ id: sessionChannelId(session.id) });
  const threadId = interviewChatThreadId(session.id, user.id);
  await chat.createThread({
    id: threadId,
    root: { type: "channel", channelId: sessionChannelId(session.id) },
  });

  expect(await getInterviewStatus(db, session.id, user.id)).toBe("not_started");

  await chat.appendPost({
    threadId,
    author: { type: "account", id: user.id },
    message: {
      id: "msg-1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    },
  });

  expect(await getInterviewStatus(db, session.id, user.id)).toBe("started");

  await chat.appendPost({
    threadId,
    author: { type: "agent", id: "agent" },
    message: {
      id: "msg-2",
      role: "assistant",
      parts: [{ type: "text", text: "done" }],
      metadata: { completion: true },
    },
  });
  expect(await getInterviewStatus(db, session.id, user.id)).toBe("complete");

  const dataDir = process.env.EXEDRA_DATA_DIR;
  db.close();
  authzDb.close();
  if (dataDir !== undefined) rmSync(dataDir, { recursive: true, force: true });
});
