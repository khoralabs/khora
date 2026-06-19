import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { ensureExedraSchema } from "../db/schema";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { canEditOrg, canEditTeam, grantTeamOrgMembership, userBelongsToOrg } from "./policy";

let db: Database;

beforeEach(async () => {
  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterEach(() => {
  db.close();
});

test("createTeam grants org membership and admin for creator", async () => {
  const creator = await getOrCreateUser(db, "creator-1");
  const orgId = await createOrg(db, { name: "Org", ownerId: creator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: creator.id });

  expect(userBelongsToOrg(db, orgId, creator.id)).toBe(true);
  expect(canEditOrg(db, creator.id, orgId)).toBe(true);
  expect(canEditTeam(db, creator.id, teamId)).toBe(true);
});

test("grantTeamOrgMembership replaces prior org grant for team", async () => {
  const creator = await getOrCreateUser(db, "creator-2");
  const orgA = await createOrg(db, { name: "Org A", ownerId: creator.id });
  const orgB = await createOrg(db, { name: "Org B", ownerId: creator.id });
  const teamId = createTeam(db, { orgId: orgA, name: "Team", ownerId: creator.id });

  grantTeamOrgMembership(db, teamId, orgB);

  const { getOrgIdForTeam } = await import("./grants");
  expect(getOrgIdForTeam(db, teamId)).toBe(orgB);
});

test("joiner gets member but not admin", async () => {
  const owner = await getOrCreateUser(db, "owner-3");
  const joiner = await getOrCreateUser(db, "joiner-3");
  const orgId = await createOrg(db, { name: "Org3", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "Team3", ownerId: owner.id });

  const { addTeamMember } = await import("../db/membership");
  addTeamMember(db, teamId, joiner.id);

  expect(userBelongsToOrg(db, orgId, joiner.id)).toBe(true);
  expect(canEditOrg(db, joiner.id, orgId)).toBe(false);
  expect(canEditTeam(db, joiner.id, teamId)).toBe(false);
});
