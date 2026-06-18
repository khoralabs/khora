import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import { loadBeliefFeedback, upsertBeliefFeedback } from "./beliefs";
import { ensureExedraSchema } from "./schema";
import { createOrg, createTeam } from "./sessions";

test("upsertBeliefFeedback persists and reloads feedback", () => {
  const db = new Database(":memory:");
  ensureExedraSchema(db);
  const now = Date.now();

  db.prepare(
    `INSERT INTO users (id, registry_user_id, created_at_ms) VALUES ('u1', 'reg-1', ?)`,
  ).run(now);
  const orgId = createOrg(db, { name: "Org", ownerId: "u1" });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: "u1" });
  db.prepare(
    `INSERT INTO sessions (id, team_id, topic, status, created_at_ms)
     VALUES ('s1', ?, 'Topic', 'active', ?)`,
  ).run(teamId, now);
  db.prepare(
    `INSERT INTO threads (id, kind, session_id, user_id, created_at_ms)
     VALUES ('th1', 'interview', 's1', 'u1', ?)`,
  ).run(now);

  upsertBeliefFeedback(db, {
    threadId: "th1",
    beliefId: "msg-1:0",
    sourceMessageId: "msg-1",
    feedback: "confirmed",
  });

  upsertBeliefFeedback(db, {
    threadId: "th1",
    beliefId: "msg-2:1",
    sourceMessageId: "msg-2",
    feedback: "corrected",
    correction: "Revised belief text",
  });

  const loaded = loadBeliefFeedback(db, "th1");
  expect(loaded).toHaveLength(2);
  expect(loaded[0]?.feedback).toBe("confirmed");
  expect(loaded[1]?.correction).toBe("Revised belief text");

  db.close();
});
