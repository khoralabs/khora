import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closeDb, getDb } from "../db/index";
import { listTeamsForUser } from "../db/membership";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { resetMemoriesStoreForTests } from "../memories/store";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-create-team-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.INVITE_PEPPER = "test-pepper-for-create-team";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY = "test-memories-key";
  closeDb();
  resetMemoriesStoreForTests();
});

afterEach(() => {
  closeDb();
  resetMemoriesStoreForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.INVITE_PEPPER;
  delete process.env.EXEDRA_IDENTITY_KEY;
  delete process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY;
});

test("POST /api/orgs/:orgId/teams creates a second team in an existing org", async () => {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-create-team-1" } },
      response: null,
    }),
  }));

  const user = await getOrCreateUser(getDb(), "registry-create-team-1");
  const orgId = await createOrg(getDb(), { name: "Acme", ownerId: user.id });
  createTeam(getDb(), { orgId, name: "Leadership", ownerId: user.id });

  const { handleCreateTeamInOrg } = await import("./routes");
  const res = await handleCreateTeamInOrg(
    new Request("http://localhost/api/orgs/x/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Product" }),
    }),
    orgId,
  );

  expect(res.status).toBe(201);
  const body = (await res.json()) as { team: { name: string; orgName: string } };
  expect(body.team.name).toBe("Product");
  expect(body.team.orgName).toBe("Acme");

  const appDb = getDb();
  const teams = listTeamsForUser(appDb, user.id);
  expect(teams).toHaveLength(2);
  expect(teams.map((team) => team.name).sort()).toEqual(["Leadership", "Product"]);
});
