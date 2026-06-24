import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { OrgPermission, TeamPermission } from "../../shared/authz/permissions";
import { interviewChatThreadId } from "../chat/thread-ids";
import { addTeamMember } from "../db/membership";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createSession, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { setTeamScopeOrgPermissions, setTeamScopePermissions } from "./grant-templates";
import {
  accountScope,
  canContributeToSessionKg,
  canContributeToTeamKg,
  canCreateSession,
  canReadPersonalKg,
  canReadSessionKg,
  canReadThread,
  Feature,
  grantPersonalKgReader,
  grantSessionCreatorAccess,
  grantSessionFacilitation,
  grantSessionParticipant,
  grantSessionReader,
  grantTeamContributor,
  grantTeamSessionParticipant,
  grantThreadAccess,
  hasFacilitationAccess,
  hasSessionAccess,
  hasTeamContributorGrant,
  isSessionFacilitator,
  ResourceType,
} from "./policy";
import { requireAuthzServiceClient } from "./service-client";
import {
  createIsolatedAuthzDatabase,
  installTestAuthzService,
  uninstallTestAuthzService,
} from "./test-service";

let db: Database;
let authzDb: Database;

beforeEach(async () => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  authzDb = createIsolatedAuthzDatabase();

  installTestAuthzService(authzDb);

  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterEach(() => {
  uninstallTestAuthzService();
  authzDb.close();
  db.close();
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("grantSessionCreatorAccess grants admin only", async () => {
  const facilitator = await getOrCreateUser(db, "fac-creator");
  const orgId = await createOrg(db, { name: "OrgCreator", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "TeamCreator", ownerId: facilitator.id });
  const session = createSession(db, { teamId, topic: "Creator" });
  await grantSessionCreatorAccess(facilitator.id, session.id);

  expect(await isSessionFacilitator(facilitator.id, session.id)).toBe(true);
  expect(await hasSessionAccess(facilitator.id, session.id)).toBe(true);
  expect(await hasFacilitationAccess(facilitator.id, session.id)).toBe(true);
});

test("hasFacilitationAccess allows facilitation collaborator", async () => {
  const facilitator = await getOrCreateUser(db, "fac-4");
  const collaborator = await getOrCreateUser(db, "collab-4");
  const orgId = await createOrg(db, { name: "Org4", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "Team4", ownerId: facilitator.id });
  await addTeamMember(db, teamId, collaborator.id);
  const session = createSession(db, { teamId, topic: "Facilitation" });
  await grantSessionCreatorAccess(facilitator.id, session.id);
  await grantSessionFacilitation(collaborator.id, session.id);

  expect(await hasFacilitationAccess(collaborator.id, session.id)).toBe(true);
  expect(await hasSessionAccess(collaborator.id, session.id)).toBe(false);
});

test("hasSessionAccess allows facilitator with admin grant", async () => {
  const facilitator = await getOrCreateUser(db, "fac-1");
  const orgId = await createOrg(db, { name: "Org", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: facilitator.id });
  const session = createSession(db, { teamId, topic: "Review" });
  await grantSessionCreatorAccess(facilitator.id, session.id);

  expect(await hasSessionAccess(facilitator.id, session.id)).toBe(true);
  expect(await isSessionFacilitator(facilitator.id, session.id)).toBe(true);
});

test("hasSessionAccess allows participant with grant", async () => {
  const facilitator = await getOrCreateUser(db, "fac-2");
  const participant = await getOrCreateUser(db, "part-2");
  const orgId = await createOrg(db, { name: "Org2", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "Team2", ownerId: facilitator.id });
  const session = createSession(db, { teamId, topic: "Sync" });
  await grantSessionCreatorAccess(facilitator.id, session.id);

  await grantSessionParticipant(participant.id, session.id);
  expect(await hasSessionAccess(participant.id, session.id)).toBe(true);
  expect(await isSessionFacilitator(participant.id, session.id)).toBe(false);
});

test("team-scoped participant grant gives all team members access", async () => {
  const facilitator = await getOrCreateUser(db, "fac-3");
  const member = await getOrCreateUser(db, "member-3");
  const orgId = await createOrg(db, { name: "Org3", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "Team3", ownerId: facilitator.id });
  await addTeamMember(db, teamId, member.id);

  const session = createSession(db, { teamId, topic: "Team session" });
  await grantSessionCreatorAccess(facilitator.id, session.id);
  await grantTeamSessionParticipant(teamId, session.id);

  expect(await hasSessionAccess(member.id, session.id)).toBe(true);
});

test("canReadThread allows thread owner via grants", async () => {
  const user = await getOrCreateUser(db, "thread-owner");
  const orgId = await createOrg(db, { name: "Org3", ownerId: user.id });
  const teamId = await createTeam(db, { orgId, name: "Team3", ownerId: user.id });
  const session = createSession(db, { teamId, topic: "Thread test" });
  await grantSessionCreatorAccess(user.id, session.id);
  const threadId = interviewChatThreadId(session.id, user.id);
  await grantThreadAccess(user.id, threadId);

  expect(await canReadThread(user.id, threadId)).toBe(true);
});

test("canReadThread allows explicit read grant holder", async () => {
  const owner = await getOrCreateUser(db, "owner-4");
  const reader = await getOrCreateUser(db, "reader-4");
  const orgId = await createOrg(db, { name: "Org4", ownerId: owner.id });
  const teamId = await createTeam(db, { orgId, name: "Team4", ownerId: owner.id });
  const session = createSession(db, { teamId, topic: "Shared thread" });
  await grantSessionCreatorAccess(owner.id, session.id);
  const threadId = interviewChatThreadId(session.id, owner.id);

  await requireAuthzServiceClient().grant({
    scope: accountScope(reader.id),
    resource: { type: ResourceType.Thread, id: threadId },
    feature: Feature.Read,
  });

  expect(await canReadThread(reader.id, threadId)).toBe(true);
});

test("canContributeToTeamKg allows team member", async () => {
  const owner = await getOrCreateUser(db, "team-owner");
  const member = await getOrCreateUser(db, "team-member");
  const orgId = await createOrg(db, { name: "Org5", ownerId: owner.id });
  const teamId = await createTeam(db, { orgId, name: "Team5", ownerId: owner.id });
  await addTeamMember(db, teamId, member.id);

  expect(await canContributeToTeamKg(member.id, teamId)).toBe(true);
});

test("canContributeToTeamKg allows contributor grant without membership", async () => {
  const owner = await getOrCreateUser(db, "team-owner-2");
  const contributor = await getOrCreateUser(db, "contributor-2");
  const orgId = await createOrg(db, { name: "Org6", ownerId: owner.id });
  const teamId = await createTeam(db, { orgId, name: "Team6", ownerId: owner.id });

  await grantTeamContributor(contributor.id, teamId);
  expect(await hasTeamContributorGrant(contributor.id, teamId)).toBe(true);
  expect(await canContributeToTeamKg(contributor.id, teamId)).toBe(true);
});

test("canContributeToTeamKg denies outsider without contributor grant", async () => {
  const owner = await getOrCreateUser(db, "team-owner-3");
  const outsider = await getOrCreateUser(db, "outsider-3");
  const orgId = await createOrg(db, { name: "Org7", ownerId: owner.id });
  const teamId = await createTeam(db, { orgId, name: "Team7", ownerId: owner.id });

  expect(await canContributeToTeamKg(outsider.id, teamId)).toBe(false);
});

test("canReadSessionKg allows direct reader but not team-inherited participant", async () => {
  const facilitator = await getOrCreateUser(db, "fac-kg-1");
  const member = await getOrCreateUser(db, "member-kg-1");
  const reader = await getOrCreateUser(db, "reader-kg-1");
  const orgId = await createOrg(db, { name: "OrgKg1", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "TeamKg1", ownerId: facilitator.id });
  await addTeamMember(db, teamId, member.id);
  const session = createSession(db, { teamId, topic: "KG session" });
  await grantSessionCreatorAccess(facilitator.id, session.id);
  await grantTeamSessionParticipant(teamId, session.id);
  await grantSessionReader(reader.id, session.id);

  expect(await hasSessionAccess(member.id, session.id)).toBe(true);
  expect(await canReadSessionKg(member.id, session.id)).toBe(false);
  expect(await canReadSessionKg(reader.id, session.id)).toBe(true);
  expect(await canContributeToSessionKg(reader.id, session.id)).toBe(false);
});

test("canContributeToSessionKg allows direct participant not team-inherited", async () => {
  const facilitator = await getOrCreateUser(db, "fac-kg-2");
  const participant = await getOrCreateUser(db, "part-kg-2");
  const member = await getOrCreateUser(db, "member-kg-2");
  const orgId = await createOrg(db, { name: "OrgKg2", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "TeamKg2", ownerId: facilitator.id });
  await addTeamMember(db, teamId, member.id);
  const session = createSession(db, { teamId, topic: "KG session 2" });
  await grantSessionCreatorAccess(facilitator.id, session.id);
  await grantSessionParticipant(participant.id, session.id);
  await grantTeamSessionParticipant(teamId, session.id);

  expect(await canContributeToSessionKg(participant.id, session.id)).toBe(true);
  expect(await canContributeToSessionKg(member.id, session.id)).toBe(false);
});

test("canReadPersonalKg allows owner and explicit reader grant", async () => {
  const owner = await getOrCreateUser(db, "personal-owner");
  const reader = await getOrCreateUser(db, "personal-reader");
  const stranger = await getOrCreateUser(db, "personal-stranger");

  expect(await canReadPersonalKg(owner.id, owner.id)).toBe(true);
  expect(await canReadPersonalKg(reader.id, owner.id)).toBe(false);

  await grantPersonalKgReader(reader.id, owner.id);
  expect(await canReadPersonalKg(reader.id, owner.id)).toBe(true);
  expect(await canReadPersonalKg(stranger.id, owner.id)).toBe(false);
});

test("canCreateSession allows team members when session_create is granted at org and team scope", async () => {
  const admin = await getOrCreateUser(db, "session-create-admin");
  const member = await getOrCreateUser(db, "session-create-member");
  const orgId = await createOrg(db, { name: "OrgCreate", ownerId: admin.id });
  const teamId = await createTeam(db, { orgId, name: "TeamCreate", ownerId: admin.id });
  await addTeamMember(db, teamId, member.id);

  expect(await canCreateSession(admin.id, teamId)).toBe(true);
  expect(await canCreateSession(member.id, teamId)).toBe(true);
});

test("canCreateSession denies members when team session_create is revoked", async () => {
  const admin = await getOrCreateUser(db, "session-create-admin-2");
  const member = await getOrCreateUser(db, "session-create-member-2");
  const orgId = await createOrg(db, { name: "OrgCreate2", ownerId: admin.id });
  const teamId = await createTeam(db, { orgId, name: "TeamCreate2", ownerId: admin.id });
  await addTeamMember(db, teamId, member.id);

  await setTeamScopePermissions(teamId, [
    TeamPermission.Read,
    TeamPermission.Write,
    TeamPermission.MemberManage,
  ]);

  expect(await canCreateSession(member.id, teamId)).toBe(false);
  expect(await canCreateSession(admin.id, teamId)).toBe(true);
});

test("canCreateSession denies members when org session_create is revoked", async () => {
  const admin = await getOrCreateUser(db, "session-create-admin-3");
  const member = await getOrCreateUser(db, "session-create-member-3");
  const orgId = await createOrg(db, { name: "OrgCreate3", ownerId: admin.id });
  const teamId = await createTeam(db, { orgId, name: "TeamCreate3", ownerId: admin.id });
  await addTeamMember(db, teamId, member.id);

  await setTeamScopeOrgPermissions(teamId, orgId, [
    OrgPermission.Read,
    OrgPermission.Write,
    OrgPermission.PermissionsManage,
    OrgPermission.TeamManage,
    OrgPermission.MemberManage,
  ]);

  expect(await canCreateSession(member.id, teamId)).toBe(false);
  expect(await canCreateSession(admin.id, teamId)).toBe(true);
});
