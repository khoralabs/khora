import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closeDb } from "../db/index";
import { ensureExedraSchema } from "../db/schema";
import {
  addSessionParticipants,
  createOrg,
  createSession,
  createTeam,
  listSessionsForUser,
} from "../db/sessions";
import { getOrCreateUser } from "../identity/users";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-session-list-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.INVITE_PEPPER = "test-pepper-for-sessions-list";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  closeDb();
});

afterEach(() => {
  closeDb();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.INVITE_PEPPER;
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("listSessionsForUser returns facilitator and participant sessions", async () => {
  const db = new Database(":memory:");
  ensureExedraSchema(db);

  const facilitator = await getOrCreateUser(db, "registry-facilitator");
  const participant = await getOrCreateUser(db, "registry-participant");
  const orgId = createOrg(db, { name: "Org", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: facilitator.id });
  db.prepare(`INSERT INTO team_members (team_id, user_id, created_at_ms) VALUES (?, ?, ?)`).run(
    teamId,
    participant.id,
    Date.now(),
  );

  const facilitated = createSession(db, {
    teamId,
    topic: "Facilitated",
    facilitatorId: facilitator.id,
  });

  const participating = createSession(db, {
    teamId,
    topic: "Participating",
    facilitatorId: participant.id,
  });
  addSessionParticipants(db, participating.id, [facilitator.id]);

  const facilitatorSessions = listSessionsForUser(db, facilitator.id);
  expect(facilitatorSessions).toHaveLength(2);
  expect(facilitatorSessions.some((s) => s.id === facilitated.id && s.role === "facilitator")).toBe(
    true,
  );
  expect(
    facilitatorSessions.some((s) => s.id === participating.id && s.role === "participant"),
  ).toBe(true);

  db.close();
});
