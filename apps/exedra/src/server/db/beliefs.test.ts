import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import { loadBeliefFeedback, upsertBeliefFeedback } from "./beliefs";
import { ensureExedraSchema } from "./schema";

test("upsertBeliefFeedback persists and reloads feedback", () => {
  const db = new Database(":memory:");
  ensureExedraSchema(db);
  const now = Date.now();

  db.prepare(
    `INSERT INTO users (id, registry_user_id, created_at_ms) VALUES ('u1', 'reg-1', ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO orgs (id, name, owner_id, created_at_ms) VALUES ('o1', 'Org', 'u1', ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO teams (id, org_id, name, owner_id, created_at_ms) VALUES ('t1', 'o1', 'Team', 'u1', ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO sessions (id, team_id, topic, facilitator_id, status, created_at_ms)
     VALUES ('s1', 't1', 'Topic', 'u1', 'active', ?)`,
  ).run(now);
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
