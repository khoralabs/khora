import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";

import {
  grantSessionCreatorAccess,
  grantSessionParticipant,
  grantTeamSessionParticipant,
} from "../authz";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createSession, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import {
  listAccountRowsForOrg,
  listAccountRowsForSession,
  listAccountRowsForTeam,
  resolveAccountProfile,
} from "./resolve-rows";

let db: Database;

beforeAll(() => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterAll(() => {
  db.close();
});

test("resolveAccountProfile returns full account profile", async () => {
  const user = await getOrCreateUser(db, "profile-user@example.com");
  const profile = resolveAccountProfile(db, user.id);
  expect(profile).not.toBeNull();
  expect(profile?.userId).toBe(user.id);
  expect(profile?.registryUserId).toBe("profile-user@example.com");
  expect(profile?.fullName).toBeNull();
  expect(profile?.avatarUrl).toBeNull();
  expect(profile?.jobFunction).toBeNull();
});

test("listAccountRowsForSession resolves participant context from grants", async () => {
  const facilitator = await getOrCreateUser(db, "fac@example.com");
  const participant = await getOrCreateUser(db, "part@example.com");
  const orgId = createOrg(db, { name: "Org", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: facilitator.id });
  const session = createSession(db, { teamId, topic: "Review" });

  grantSessionCreatorAccess(db, facilitator.id, session.id);
  grantSessionParticipant(db, participant.id, session.id);

  const rows = listAccountRowsForSession(db, session.id, facilitator.id);
  expect(rows).toHaveLength(2);

  const facilitatorRow = rows.find((row) => row.account.userId === facilitator.id);
  const participantRow = rows.find((row) => row.account.userId === participant.id);

  expect(facilitatorRow?.context.kind).toBe("session_participant");
  expect(facilitatorRow?.context.role).toBe("facilitator");
  expect(facilitatorRow?.isCurrentUser).toBe(true);
  expect(facilitatorRow?.account.registryUserId).toBe("fac@example.com");

  expect(participantRow?.context.role).toBe("participant");
  expect(participantRow?.isCurrentUser).toBe(false);
});

test("listAccountRowsForSession expands team-scoped participant grants", async () => {
  const facilitator = await getOrCreateUser(db, "fac-team@example.com");
  const participant = await getOrCreateUser(db, "part-team@example.com");
  const orgId = createOrg(db, { name: "Org2", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team2", ownerId: facilitator.id });
  const session = createSession(db, { teamId, topic: "Sync" });

  grantSessionCreatorAccess(db, facilitator.id, session.id);
  const { addTeamMember } = await import("../db/membership");
  addTeamMember(db, teamId, participant.id);
  grantTeamSessionParticipant(db, teamId, session.id);

  const rows = listAccountRowsForSession(db, session.id, facilitator.id);
  expect(rows.some((row) => row.account.userId === participant.id)).toBe(true);
});

test("listAccountRowsForTeam includes admin context", async () => {
  const owner = await getOrCreateUser(db, "owner@example.com");
  const member = await getOrCreateUser(db, "member@example.com");
  const orgId = createOrg(db, { name: "Org3", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "Team3", ownerId: owner.id });
  const { addTeamMember } = await import("../db/membership");
  addTeamMember(db, teamId, member.id);

  const rows = listAccountRowsForTeam(db, teamId, member.id);
  expect(rows).toHaveLength(2);

  const ownerRow = rows.find((row) => row.account.userId === owner.id);
  const memberRow = rows.find((row) => row.account.userId === member.id);

  expect(ownerRow?.context.kind).toBe("team_member");
  expect(ownerRow?.context.isAdmin).toBe(true);
  expect(memberRow?.context.isAdmin).toBe(false);
  expect(memberRow?.isCurrentUser).toBe(true);
});

test("listAccountRowsForOrg aggregates team membership", async () => {
  const owner = await getOrCreateUser(db, "org-owner@example.com");
  const member = await getOrCreateUser(db, "org-member@example.com");
  const orgId = createOrg(db, { name: "Org4", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "Team4", ownerId: owner.id });
  const { addTeamMember } = await import("../db/membership");
  addTeamMember(db, teamId, member.id);

  const rows = listAccountRowsForOrg(db, orgId, owner.id);
  expect(rows).toHaveLength(2);

  const memberRow = rows.find((row) => row.account.userId === member.id);
  expect(memberRow?.context.kind).toBe("org_member");
  expect(memberRow?.context.teamNames).toContain("Team4");
  expect(memberRow?.context.isAdmin).toBe(false);
});
