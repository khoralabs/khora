import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { addTeamMember } from "../db/membership";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createSession, createTeam, getOrCreateInterviewThread } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { grant } from "./grants";
import {
  canReadThread,
  Feature,
  grantSessionCreatorAccess,
  grantSessionParticipant,
  grantTeamSessionParticipant,
  hasSessionAccess,
  isSessionFacilitator,
  ResourceType,
} from "./policy";

let db: Database;

beforeEach(async () => {
  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterEach(() => {
  db.close();
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
