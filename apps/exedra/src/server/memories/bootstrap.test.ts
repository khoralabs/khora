import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closeDb } from "../db/index";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { bootstrapOrgTeamMemories, bootstrapSessionMemories } from "./bootstrap";
import {
  orgScope,
  orgSessionScope,
  orgTeamScope,
  userScope,
  userSessionScope,
  userTeamScope,
} from "./namespaces";
import { resolveOrgMemoriesDbPath, resolveUserMemoriesDbPath } from "./paths";
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

test("bootstrapSessionMemories creates org and user session scope chains under team", async () => {
  const appDb = new Database(":memory:");
  ensureExedraSchema(appDb);
  const user = await getOrCreateUser(appDb, "registry-session-bootstrap");
  const orgId = createOrg(appDb, { name: "Org", ownerId: user.id });
  const teamId = createTeam(appDb, { orgId, name: "Team", ownerId: user.id });
  const sessionId = crypto.randomUUID();

  bootstrapOrgTeamMemories({ orgId, teamId, userId: user.id });
  bootstrapSessionMemories({
    orgId,
    teamId,
    sessionId,
    userIds: [user.id],
  });

  const orgDbPath = resolveOrgMemoriesDbPath(orgId);
  const userDbPath = resolveUserMemoriesDbPath(user.id);

  const orgDb = new Database(orgDbPath);
  const orgScopes = orgDb
    .query<{ _id: string }, []>(`SELECT _id FROM scopes ORDER BY _id ASC`)
    .all()
    .map((row) => row._id);
  orgDb.close();

  expect(orgScopes).toEqual([
    "_global_",
    orgScope(orgId),
    orgTeamScope(orgId, teamId),
    orgSessionScope(orgId, teamId, sessionId),
  ]);

  const userDb = new Database(userDbPath);
  const userScopes = userDb
    .query<{ _id: string }, []>(`SELECT _id FROM scopes ORDER BY _id ASC`)
    .all()
    .map((row) => row._id);
  userDb.close();

  expect(userScopes).toEqual([
    "_global_",
    userScope(user.id),
    userTeamScope(user.id, orgId, teamId),
    userSessionScope(user.id, orgId, teamId, sessionId),
  ]);

  appDb.close();
});
