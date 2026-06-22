import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  canReadPersonalKg,
  grantPersonalKgReader,
  grantSessionParticipant,
  revokePersonalKgReader,
} from "../authz/policy";
import { addTeamMember } from "../db/membership";
import { ensureExedraSchema } from "../db/schema";
import { hasPersonalMemoryConsent } from "../db/session-participants";
import { createOrg, createSession, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import {
  canOrgAgentAccessParticipantPersonalMemories,
  grantPersonalMemoryAccessForSession,
  releasePersonalMemoryAccessForSession,
} from "./personal-memory-access";

let db: Database;

beforeEach(async () => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterEach(() => {
  db.close();
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("grantPersonalMemoryAccessForSession grants org reader and records consent", async () => {
  const orgOwner = await getOrCreateUser(db, "org-owner-pm");
  const participant = await getOrCreateUser(db, "participant-pm");
  const orgId = await createOrg(db, { name: "OrgPM", ownerId: orgOwner.id });
  const teamId = createTeam(db, { orgId, name: "TeamPM", ownerId: orgOwner.id });
  const session = createSession(db, { teamId, topic: "PM session" });
  grantSessionParticipant(db, participant.id, session.id);

  grantPersonalMemoryAccessForSession(db, {
    orgId,
    sessionId: session.id,
    userId: participant.id,
  });

  expect(canReadPersonalKg(db, orgId, participant.id)).toBe(true);
  expect(hasPersonalMemoryConsent(db, session.id, participant.id)).toBe(true);
  expect(
    canOrgAgentAccessParticipantPersonalMemories(db, {
      orgId,
      sessionId: session.id,
      participantUserId: participant.id,
    }),
  ).toBe(true);
});

test("releasePersonalMemoryAccessForSession revokes grant when no other consented sessions", async () => {
  const orgOwner = await getOrCreateUser(db, "org-owner-pm-2");
  const participant = await getOrCreateUser(db, "participant-pm-2");
  const orgId = await createOrg(db, { name: "OrgPM2", ownerId: orgOwner.id });
  const teamId = createTeam(db, { orgId, name: "TeamPM2", ownerId: orgOwner.id });
  const session = createSession(db, { teamId, topic: "PM session 2" });
  grantSessionParticipant(db, participant.id, session.id);

  grantPersonalMemoryAccessForSession(db, {
    orgId,
    sessionId: session.id,
    userId: participant.id,
  });

  releasePersonalMemoryAccessForSession(db, session.id);

  expect(canReadPersonalKg(db, orgId, participant.id)).toBe(false);
  expect(hasPersonalMemoryConsent(db, session.id, participant.id)).toBe(false);
});

test("releasePersonalMemoryAccessForSession keeps grant when another session has consent", async () => {
  const orgOwner = await getOrCreateUser(db, "org-owner-pm-3");
  const participant = await getOrCreateUser(db, "participant-pm-3");
  const orgId = await createOrg(db, { name: "OrgPM3", ownerId: orgOwner.id });
  const teamId = createTeam(db, { orgId, name: "TeamPM3", ownerId: orgOwner.id });
  const sessionA = createSession(db, { teamId, topic: "PM session A" });
  const sessionB = createSession(db, { teamId, topic: "PM session B" });
  grantSessionParticipant(db, participant.id, sessionA.id);
  grantSessionParticipant(db, participant.id, sessionB.id);

  grantPersonalMemoryAccessForSession(db, {
    orgId,
    sessionId: sessionA.id,
    userId: participant.id,
  });
  grantPersonalMemoryAccessForSession(db, {
    orgId,
    sessionId: sessionB.id,
    userId: participant.id,
  });

  releasePersonalMemoryAccessForSession(db, sessionA.id);

  expect(canReadPersonalKg(db, orgId, participant.id)).toBe(true);
  expect(hasPersonalMemoryConsent(db, sessionB.id, participant.id)).toBe(true);
});

test("canOrgAgentAccessParticipantPersonalMemories denies without grant", async () => {
  const orgOwner = await getOrCreateUser(db, "org-owner-pm-4");
  const participant = await getOrCreateUser(db, "participant-pm-4");
  const orgId = await createOrg(db, { name: "OrgPM4", ownerId: orgOwner.id });
  const teamId = createTeam(db, { orgId, name: "TeamPM4", ownerId: orgOwner.id });
  const session = createSession(db, { teamId, topic: "PM session 4" });
  addTeamMember(db, teamId, participant.id);
  grantSessionParticipant(db, participant.id, session.id);

  expect(
    canOrgAgentAccessParticipantPersonalMemories(db, {
      orgId,
      sessionId: session.id,
      participantUserId: participant.id,
    }),
  ).toBe(false);

  grantPersonalKgReader(db, orgId, participant.id);
  expect(
    canOrgAgentAccessParticipantPersonalMemories(db, {
      orgId,
      sessionId: session.id,
      participantUserId: participant.id,
    }),
  ).toBe(false);

  revokePersonalKgReader(db, orgId, participant.id);
});
