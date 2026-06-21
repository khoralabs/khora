import { Database } from "bun:sqlite";
import { beforeAll, expect, test } from "bun:test";
import { getOrCreateUser } from "../identity/users";
import { insertMessage } from "./messages";
import { ensureExedraSchema } from "./schema";
import { formatDaysToDeadline, getInterviewStatus, sessionPhaseFromStatus } from "./session-detail";
import { createOrg, createSession, createTeam } from "./sessions";

beforeAll(() => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
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
  const db = new Database(":memory:");
  ensureExedraSchema(db);
  const user = await getOrCreateUser(db, "registry-interview-status");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Review",
  });

  expect(getInterviewStatus(db, session.id, user.id)).toBe("not_started");

  const threadId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO threads (id, kind, session_id, user_id, created_at_ms, closed_at_ms)
     VALUES (?, 'interview', ?, ?, ?, NULL)`,
  ).run(threadId, session.id, user.id, Date.now());

  expect(getInterviewStatus(db, session.id, user.id)).toBe("not_started");

  insertMessage(db, {
    id: "msg-1",
    threadId,
    role: "user",
    parts: [{ type: "text", text: "hello" }],
    messageIndex: 0,
    authorDid: user.id,
  });

  expect(getInterviewStatus(db, session.id, user.id)).toBe("started");

  db.prepare(`UPDATE threads SET closed_at_ms = ? WHERE id = ?`).run(Date.now(), threadId);
  expect(getInterviewStatus(db, session.id, user.id)).toBe("complete");

  db.close();
});
