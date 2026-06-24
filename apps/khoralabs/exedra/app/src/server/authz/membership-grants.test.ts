import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  createIsolatedAuthzDatabase,
  installTestAuthzService,
  uninstallTestAuthzService,
} from "../authz/test-service";

import { ensureExedraSchema } from "../db/schema";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { canEditOrg, canEditTeam, grantTeamOrgMembership, userBelongsToOrg } from "./policy";

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

test("createTeam grants org membership and admin for creator", async () => {
  const creator = await getOrCreateUser(db, "creator-1");
  const orgId = await createOrg(db, { name: "Org", ownerId: creator.id });
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: creator.id });

  expect(await userBelongsToOrg(orgId, creator.id)).toBe(true);
  expect(await canEditOrg(creator.id, orgId)).toBe(true);
  expect(await canEditTeam(creator.id, teamId)).toBe(true);
});

test("grantTeamOrgMembership replaces prior org grant for team", async () => {
  const creator = await getOrCreateUser(db, "creator-2");
  const orgA = await createOrg(db, { name: "Org A", ownerId: creator.id });
  const orgB = await createOrg(db, { name: "Org B", ownerId: creator.id });
  const teamId = await createTeam(db, { orgId: orgA, name: "Team", ownerId: creator.id });

  await grantTeamOrgMembership(teamId, orgB);

  const { getOrgIdForTeam } = await import("./policy");
  expect(await getOrgIdForTeam(teamId)).toBe(orgB);
});

test("joiner gets member but not admin", async () => {
  const owner = await getOrCreateUser(db, "owner-3");
  const joiner = await getOrCreateUser(db, "joiner-3");
  const orgId = await createOrg(db, { name: "Org3", ownerId: owner.id });
  const teamId = await createTeam(db, { orgId, name: "Team3", ownerId: owner.id });

  const { addTeamMember } = await import("../db/membership");
  await addTeamMember(db, teamId, joiner.id);

  expect(await userBelongsToOrg(orgId, joiner.id)).toBe(true);
  expect(await canEditOrg(joiner.id, orgId)).toBe(false);
  expect(await canEditTeam(joiner.id, teamId)).toBe(false);
});
