import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  grantSessionCreatorAccess,
  grantSessionParticipant,
  grantTeamSessionParticipant,
} from "../authz";
import { closeDb } from "../db/index";
import { getOrCreateUser } from "../identity/users";
import { addTeamMember } from "./membership";
import { ensureExedraSchema } from "./schema";
import { listSessionParticipantDetails } from "./session-detail";
import { createOrg, createSession, createTeam, listSessionsForUser } from "./sessions";

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
  addTeamMember(db, teamId, participant.id);

  const facilitated = createSession(db, { teamId, topic: "Facilitated" });
  grantSessionCreatorAccess(db, facilitator.id, facilitated.id);

  const participating = createSession(db, { teamId, topic: "Participating" });
  grantSessionCreatorAccess(db, participant.id, participating.id);
  grantSessionParticipant(db, facilitator.id, participating.id);

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

test("team-scoped grant lists all team members as participants", async () => {
  const db = new Database(":memory:");
  ensureExedraSchema(db);

  const facilitator = await getOrCreateUser(db, "registry-fac-team");
  const member = await getOrCreateUser(db, "registry-member-team");
  const orgId = createOrg(db, { name: "Org", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: facilitator.id });
  addTeamMember(db, teamId, member.id);

  const session = createSession(db, { teamId, topic: "Shared" });
  grantSessionCreatorAccess(db, facilitator.id, session.id);
  grantTeamSessionParticipant(db, teamId, session.id);

  const participants = listSessionParticipantDetails(db, session.id);
  expect(participants.some((p) => p.userId === facilitator.id && p.role === "facilitator")).toBe(
    true,
  );
  expect(participants.some((p) => p.userId === member.id && p.role === "participant")).toBe(true);

  db.close();
});
