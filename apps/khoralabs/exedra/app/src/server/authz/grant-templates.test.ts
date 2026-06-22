import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { OrgPermission, TEAM_PERMISSIONS, TeamPermission } from "../../shared/authz/permissions";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import {
  grantAllOrgPermissions,
  listEffectiveOrgPermissionsForAccount,
  listOrgPermissionsForAccount,
  listTeamPermissionsForAccount,
  listTeamScopeOrgPermissions,
  listTeamScopePermissions,
  setOrgPermissionsForAccount,
  setTeamScopeOrgPermissions,
  setTeamScopePermissions,
} from "./grant-templates";
import { grantTeamMember, hasOrgPermission, hasTeamPermission } from "./policy";

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

test("grantAllOrgPermissions grants every organization permission", async () => {
  const creator = await getOrCreateUser(db, "creator@example.com");
  const orgId = await createOrg(db, { name: "Acme", ownerId: creator.id });
  const granted = listOrgPermissionsForAccount(db, creator.id, orgId);
  expect(granted).toContain(OrgPermission.PermissionsManage);
  expect(granted).toContain(OrgPermission.Write);
  expect(granted).toContain(OrgPermission.Read);
  expect(granted).toContain(OrgPermission.TeamManage);
  expect(granted).toContain(OrgPermission.MemberManage);
  expect(granted).toContain(OrgPermission.SessionCreate);
});

test("grantAllTeamPermissions grants every team permission", async () => {
  const creator = await getOrCreateUser(db, "team-creator@example.com");
  const orgId = await createOrg(db, { name: "Org", ownerId: creator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: creator.id });
  const granted = listTeamPermissionsForAccount(db, creator.id, teamId);
  expect(granted.sort()).toEqual([...TEAM_PERMISSIONS].sort());
});

test("setOrgPermissionsForAccount replaces active org permission grants", async () => {
  const creator = await getOrCreateUser(db, "setter@example.com");
  const joiner = await getOrCreateUser(db, "joiner@example.com");
  const orgId = await createOrg(db, { name: "Org", ownerId: creator.id });
  grantAllOrgPermissions(db, joiner.id, orgId);
  setOrgPermissionsForAccount(db, joiner.id, orgId, [OrgPermission.Read]);
  const granted = listOrgPermissionsForAccount(db, joiner.id, orgId);
  expect(granted).toEqual([OrgPermission.Read]);
});

test("team scope permissions apply to every team member", async () => {
  const creator = await getOrCreateUser(db, "team-admin@example.com");
  const member = await getOrCreateUser(db, "team-member@example.com");
  const orgId = await createOrg(db, { name: "Org", ownerId: creator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: creator.id });
  grantTeamMember(db, member.id, teamId);
  setTeamScopePermissions(db, teamId, [TeamPermission.Write]);

  expect(listTeamScopePermissions(db, teamId)).toEqual([TeamPermission.Write]);
  expect(listTeamPermissionsForAccount(db, member.id, teamId)).toEqual([]);
  expect(hasTeamPermission(db, member.id, teamId, TeamPermission.Write)).toBe(true);
  expect(hasTeamPermission(db, member.id, teamId, TeamPermission.MemberManage)).toBe(false);
});

test("team scope org permissions apply to every team member", async () => {
  const creator = await getOrCreateUser(db, "org-admin@example.com");
  const member = await getOrCreateUser(db, "org-member@example.com");
  const orgId = await createOrg(db, { name: "Org", ownerId: creator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: creator.id });
  grantTeamMember(db, member.id, teamId);
  setTeamScopeOrgPermissions(db, teamId, orgId, [OrgPermission.TeamManage]);

  expect(listTeamScopeOrgPermissions(db, teamId, orgId)).toEqual([OrgPermission.TeamManage]);
  expect(listOrgPermissionsForAccount(db, member.id, orgId)).toEqual([]);
  expect(listEffectiveOrgPermissionsForAccount(db, member.id, orgId)).toEqual([
    OrgPermission.TeamManage,
  ]);
  expect(hasOrgPermission(db, member.id, orgId, OrgPermission.TeamManage)).toBe(true);
  expect(hasOrgPermission(db, member.id, orgId, OrgPermission.Write)).toBe(false);
});
