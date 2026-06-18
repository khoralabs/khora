import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";

import { inviteKind, sessionParticipantInviteEffects } from "@shared/invites/effects";

import { grantSessionCreatorAccess, grantSessionParticipant } from "../authz";
import { getOrCreateUser } from "../identity/users";
import { applyInviteEffects } from "../invites/apply-effects";
import {
  consumeInvite,
  getInvitePublicInfo,
  getInviteSessionId,
  getInviteTeamId,
  mintSessionParticipantInvite,
  mintTeamMemberInvite,
} from "./invites";
import { ensureExedraSchema } from "./schema";
import { createOrg, createSession, createTeam, userHasSessionAccess } from "./sessions";

beforeAll(() => {
  process.env.INVITE_PEPPER = "test-pepper-for-invites";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

let db: Database;

beforeAll(async () => {
  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterAll(() => {
  db.close();
});

test("session invite effects classify as session when team grant included", () => {
  const effects = sessionParticipantInviteEffects("session-1", "team-1");
  expect(inviteKind(effects)).toBe("session");
  expect(effects.grants).toHaveLength(2);
});

test("session invite public info includes org details", async () => {
  const user = await getOrCreateUser(db, "registry-user-invite-session-org");
  const orgId = createOrg(db, { name: "Acme Corp", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Leadership", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Quarterly review",
  });
  grantSessionCreatorAccess(db, user.id, session.id);

  const token = mintSessionParticipantInvite(db, {
    sessionId: session.id,
    teamId,
    createdByUserId: user.id,
  });
  const info = getInvitePublicInfo(db, token);
  expect(info?.kind).toBe("session");
  expect(info?.topic).toBe("Quarterly review");
  expect(info?.teamName).toBe("Leadership");
  expect(info?.orgName).toBe("Acme Corp");
});

test("getInviteSessionId resolves session for token", async () => {
  const user = await getOrCreateUser(db, "registry-user-invite-session");
  const orgId = createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Review",
  });
  grantSessionCreatorAccess(db, user.id, session.id);

  const token = mintSessionParticipantInvite(db, {
    sessionId: session.id,
    teamId,
    createdByUserId: user.id,
  });
  expect(getInviteSessionId(db, token)).toBe(session.id);
});

test("team invite is single-use and grants membership on accept", async () => {
  const owner = await getOrCreateUser(db, "registry-team-invite-owner");
  const joiner = await getOrCreateUser(db, "registry-team-invite-joiner");
  const orgId = createOrg(db, { name: "OrgTeam", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "TeamInvite", ownerId: owner.id });

  const token = mintTeamMemberInvite(db, { teamId, createdByUserId: owner.id });
  expect(getInviteTeamId(db, token)).toBe(teamId);

  const info = getInvitePublicInfo(db, token);
  expect(info?.kind).toBe("team");
  expect(info?.status).toBe("pending");
  expect(info?.teamName).toBe("TeamInvite");

  const effects = consumeInvite(db, token, joiner.id);
  expect(effects).not.toBeNull();
  if (effects !== null) applyInviteEffects(db, joiner.id, effects);

  const infoAfter = getInvitePublicInfo(db, token);
  expect(infoAfter?.status).toBe("accepted");

  const second = consumeInvite(db, token, joiner.id);
  expect(second).toBeNull();
});

test("user with session access is treated as already joined", async () => {
  const facilitator = await getOrCreateUser(db, "registry-facilitator");
  const participant = await getOrCreateUser(db, "registry-participant");
  const orgId = createOrg(db, { name: "Org2", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team2", ownerId: facilitator.id });
  const session = createSession(db, {
    teamId,
    topic: "Alignment",
  });
  grantSessionCreatorAccess(db, facilitator.id, session.id);

  const token = mintSessionParticipantInvite(db, {
    sessionId: session.id,
    teamId,
    createdByUserId: facilitator.id,
  });
  const effects = consumeInvite(db, token, participant.id);
  expect(effects).not.toBeNull();
  if (effects !== null) applyInviteEffects(db, participant.id, effects);
  grantSessionParticipant(db, participant.id, session.id);

  expect(userHasSessionAccess(db, session.id, participant.id)).toBe(true);

  const secondConsume = consumeInvite(db, token, participant.id);
  expect(secondConsume).toBeNull();
});
