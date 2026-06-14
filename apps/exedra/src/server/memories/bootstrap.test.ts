import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closeDb } from "../db/index";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { bootstrapOrgTeamMemories } from "./bootstrap";
import { orgScope, orgTeamScope, userScope, userTeamScope } from "./namespaces";
import { resetMemoriesStoreForTests } from "./store";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-memories-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY = "test-memories-key";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  closeDb();
  resetMemoriesStoreForTests();
});

afterEach(() => {
  closeDb();
  resetMemoriesStoreForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY;
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("bootstrapOrgTeamMemories creates org and user scope chains", async () => {
  const appDb = new Database(":memory:");
  ensureExedraSchema(appDb);
  const user = await getOrCreateUser(appDb, "registry-bootstrap");
  const orgId = createOrg(appDb, { name: "Org", ownerId: user.id });
  const teamId = createTeam(appDb, { orgId, name: "Team", ownerId: user.id });

  const first = bootstrapOrgTeamMemories({ orgId, teamId, userId: user.id });
  const second = bootstrapOrgTeamMemories({ orgId, teamId, userId: user.id });

  expect(first.orgDbPath).toBe(second.orgDbPath);
  expect(first.userDbPath).toBe(second.userDbPath);

  const orgDb = new Database(first.orgDbPath);
  const orgScopes = orgDb
    .query<{ _id: string }, []>(`SELECT _id FROM scopes ORDER BY _id ASC`)
    .all()
    .map((row) => row._id);
  orgDb.close();

  expect(orgScopes).toEqual(["_global_", orgScope(orgId), orgTeamScope(orgId, teamId)]);

  const userDb = new Database(first.userDbPath);
  const userScopes = userDb
    .query<{ _id: string }, []>(`SELECT _id FROM scopes ORDER BY _id ASC`)
    .all()
    .map((row) => row._id);
  userDb.close();

  expect(userScopes).toEqual([
    "_global_",
    userScope(user.id),
    userTeamScope(user.id, orgId, teamId),
  ]);

  appDb.close();
});
