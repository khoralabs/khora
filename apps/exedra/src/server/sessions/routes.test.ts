import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closeDb } from "../db/index";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { resetMemoriesStoreForTests } from "../memories/store";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-session-gate-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.INVITE_PEPPER = "test-pepper-for-sessions";
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

test("POST /api/sessions requires teamId", async () => {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-session-1" } },
      response: null,
    }),
  }));

  const { handleCreateSession: createSessionHandler } = await import("./routes");
  const res = await createSessionHandler(
    new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "Review",
      }),
    }),
  );

  expect(res.status).toBe(400);
  const body = (await res.json()) as { onboardingRequired?: boolean };
  expect(body.onboardingRequired).toBe(true);
});

test("POST /api/sessions creates session when teamId is provided", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const user = await getOrCreateUser(db, "registry-session-2");
  const orgId = createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  db.close();

  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-session-2" } },
      response: null,
    }),
  }));

  const { handleCreateSession: createSessionHandler } = await import("./routes");
  const res = await createSessionHandler(
    new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        topic: "Review",
      }),
    }),
  );

  expect(res.status).toBe(201);
  const body = (await res.json()) as { session: { teamId: string } };
  expect(body.session.teamId).toBe(teamId);
});
