import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { addTeamMember } from "../db/membership";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createSession, createTeam, getOrCreateInterviewThread } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { grant } from "./grants";
import {
  canContributeToSessionKg,
  canContributeToTeamKg,
  canReadPersonalKg,
  canReadSessionKg,
  canReadThread,
  Feature,
  grantPersonalKgReader,
  grantSessionCreatorAccess,
  grantSessionParticipant,
  grantSessionReader,
  grantTeamContributor,
  grantTeamSessionParticipant,
  hasSessionAccess,
  hasTeamContributorGrant,
  isSessionFacilitator,
  ResourceType,
} from "./policy";

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

test("hasSessionAccess allows facilitator with admin grant", async () => {
  const facilitator = await getOrCreateUser(db, "fac-1");
  const orgId = await createOrg(db, { name: "Org", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: facilitator.id });
  const session = createSession(db, { teamId, topic: "Review" });
  grantSessionCreatorAccess(db, facilitator.id, session.id);

  expect(hasSessionAccess(db, facilitator.id, session.id)).toBe(true);
  expect(isSessionFacilitator(db, facilitator.id, session.id)).toBe(true);
});

test("hasSessionAccess allows participant with grant", async () => {
  const facilitator = await getOrCreateUser(db, "fac-2");
  const participant = await getOrCreateUser(db, "part-2");
  const orgId = await createOrg(db, { name: "Org2", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team2", ownerId: facilitator.id });
  const session = createSession(db, { teamId, topic: "Sync" });
  grantSessionCreatorAccess(db, facilitator.id, session.id);

  grantSessionParticipant(db, participant.id, session.id);
  expect(hasSessionAccess(db, participant.id, session.id)).toBe(true);
  expect(isSessionFacilitator(db, participant.id, session.id)).toBe(false);
});

test("team-scoped participant grant gives all team members access", async () => {
  const facilitator = await getOrCreateUser(db, "fac-3");
  const member = await getOrCreateUser(db, "member-3");
  const orgId = await createOrg(db, { name: "Org3", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team3", ownerId: facilitator.id });
  addTeamMember(db, teamId, member.id);

  const session = createSession(db, { teamId, topic: "Team session" });
  grantSessionCreatorAccess(db, facilitator.id, session.id);
  grantTeamSessionParticipant(db, teamId, session.id);

  expect(hasSessionAccess(db, member.id, session.id)).toBe(true);
});

test("canReadThread allows thread owner via grants", async () => {
  const user = await getOrCreateUser(db, "thread-owner");
  const orgId = await createOrg(db, { name: "Org3", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team3", ownerId: user.id });
  const session = createSession(db, { teamId, topic: "Thread test" });
  grantSessionCreatorAccess(db, user.id, session.id);
  const threadId = getOrCreateInterviewThread(db, { sessionId: session.id, userId: user.id });

  expect(canReadThread(db, user.id, threadId)).toBe(true);
});

test("canReadThread allows explicit read grant holder", async () => {
  const owner = await getOrCreateUser(db, "owner-4");
  const reader = await getOrCreateUser(db, "reader-4");
  const orgId = await createOrg(db, { name: "Org4", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "Team4", ownerId: owner.id });
  const session = createSession(db, { teamId, topic: "Shared thread" });
  grantSessionCreatorAccess(db, owner.id, session.id);
  const threadId = getOrCreateInterviewThread(db, { sessionId: session.id, userId: owner.id });

  grant(
    db,
    { type: "account", id: reader.id },
    { type: ResourceType.Thread, id: threadId },
    Feature.Read,
  );

  expect(canReadThread(db, reader.id, threadId)).toBe(true);
});

test("canContributeToTeamKg allows team member", async () => {
  const owner = await getOrCreateUser(db, "team-owner");
  const member = await getOrCreateUser(db, "team-member");
  const orgId = await createOrg(db, { name: "Org5", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "Team5", ownerId: owner.id });
  addTeamMember(db, teamId, member.id);

  expect(canContributeToTeamKg(db, member.id, teamId)).toBe(true);
});

test("canContributeToTeamKg allows contributor grant without membership", async () => {
  const owner = await getOrCreateUser(db, "team-owner-2");
  const contributor = await getOrCreateUser(db, "contributor-2");
  const orgId = await createOrg(db, { name: "Org6", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "Team6", ownerId: owner.id });

  grantTeamContributor(db, contributor.id, teamId);
  expect(hasTeamContributorGrant(db, contributor.id, teamId)).toBe(true);
  expect(canContributeToTeamKg(db, contributor.id, teamId)).toBe(true);
});

test("canContributeToTeamKg denies outsider without contributor grant", async () => {
  const owner = await getOrCreateUser(db, "team-owner-3");
  const outsider = await getOrCreateUser(db, "outsider-3");
  const orgId = await createOrg(db, { name: "Org7", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "Team7", ownerId: owner.id });

  expect(canContributeToTeamKg(db, outsider.id, teamId)).toBe(false);
});

test("canReadSessionKg allows direct reader but not team-inherited participant", async () => {
  const facilitator = await getOrCreateUser(db, "fac-kg-1");
  const member = await getOrCreateUser(db, "member-kg-1");
  const reader = await getOrCreateUser(db, "reader-kg-1");
  const orgId = await createOrg(db, { name: "OrgKg1", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "TeamKg1", ownerId: facilitator.id });
  addTeamMember(db, teamId, member.id);
  const session = createSession(db, { teamId, topic: "KG session" });
  grantSessionCreatorAccess(db, facilitator.id, session.id);
  grantTeamSessionParticipant(db, teamId, session.id);
  grantSessionReader(db, reader.id, session.id);

  expect(hasSessionAccess(db, member.id, session.id)).toBe(true);
  expect(canReadSessionKg(db, member.id, session.id)).toBe(false);
  expect(canReadSessionKg(db, reader.id, session.id)).toBe(true);
  expect(canContributeToSessionKg(db, reader.id, session.id)).toBe(false);
});

test("canContributeToSessionKg allows direct participant not team-inherited", async () => {
  const facilitator = await getOrCreateUser(db, "fac-kg-2");
  const participant = await getOrCreateUser(db, "part-kg-2");
  const member = await getOrCreateUser(db, "member-kg-2");
  const orgId = await createOrg(db, { name: "OrgKg2", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "TeamKg2", ownerId: facilitator.id });
  addTeamMember(db, teamId, member.id);
  const session = createSession(db, { teamId, topic: "KG session 2" });
  grantSessionCreatorAccess(db, facilitator.id, session.id);
  grantSessionParticipant(db, participant.id, session.id);
  grantTeamSessionParticipant(db, teamId, session.id);

  expect(canContributeToSessionKg(db, participant.id, session.id)).toBe(true);
  expect(canContributeToSessionKg(db, member.id, session.id)).toBe(false);
});

test("canReadPersonalKg allows owner and explicit reader grant", async () => {
  const owner = await getOrCreateUser(db, "personal-owner");
  const reader = await getOrCreateUser(db, "personal-reader");
  const stranger = await getOrCreateUser(db, "personal-stranger");

  expect(canReadPersonalKg(db, owner.id, owner.id)).toBe(true);
  expect(canReadPersonalKg(db, reader.id, owner.id)).toBe(false);

  grantPersonalKgReader(db, reader.id, owner.id);
  expect(canReadPersonalKg(db, reader.id, owner.id)).toBe(true);
  expect(canReadPersonalKg(db, stranger.id, owner.id)).toBe(false);
});
