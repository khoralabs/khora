import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closeDb } from "../db/index";
import { getInviteTeamId, mintTeamMemberInvite } from "../db/invites";
import { addTeamMember, listTeamsForUser, userHasAnyTeam } from "../db/membership";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { resetMemoriesStoreForTests } from "../memories/store";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-onboarding-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.INVITE_PEPPER = "test-pepper-for-onboarding";
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

test("GET /api/me reports onboardingRequired until user joins a team", async () => {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-me-1" } },
      response: null,
    }),
  }));

  const { handleGetMe, handlePostOnboarding } = await import("./routes");
  const before = await handleGetMe(new Request("http://localhost/api/me"));
  expect(before.status).toBe(200);
  const beforeBody = (await before.json()) as { onboardingRequired: boolean; teams: unknown[] };
  expect(beforeBody.onboardingRequired).toBe(true);
  expect(beforeBody.teams).toHaveLength(0);

  const created = await handlePostOnboarding(
    new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName: "Acme", teamName: "Leadership" }),
    }),
  );
  expect(created.status).toBe(201);

  const after = await handleGetMe(new Request("http://localhost/api/me"));
  const afterBody = (await after.json()) as {
    onboardingRequired: boolean;
    onboardingInterviewRequired: boolean;
    onboardingSessionId: string | null;
    teams: { name: string; orgName: string }[];
  };
  expect(afterBody.onboardingRequired).toBe(false);
  expect(afterBody.onboardingInterviewRequired).toBe(true);
  expect(afterBody.onboardingSessionId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(afterBody.teams[0]?.name).toBe("Leadership");
  expect(afterBody.teams[0]?.orgName).toBe("Acme");
});

test("PATCH /api/me updates profile fields", async () => {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-me-profile" } },
      response: null,
    }),
  }));

  const { handleGetMe, handlePatchMe } = await import("./routes");
  await handleGetMe(new Request("http://localhost/api/me"));

  const patched = await handlePatchMe(
    new Request("http://localhost/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "Alex Morgan", jobFunction: "Product manager" }),
    }),
  );
  expect(patched.status).toBe(200);
  const patchedBody = (await patched.json()) as {
    user: { fullName: string | null; jobFunction: string | null };
  };
  expect(patchedBody.user.fullName).toBe("Alex Morgan");
  expect(patchedBody.user.jobFunction).toBe("Product manager");

  const after = await handleGetMe(new Request("http://localhost/api/me"));
  const afterBody = (await after.json()) as {
    user: { fullName: string | null; jobFunction: string | null };
  };
  expect(afterBody.user.fullName).toBe("Alex Morgan");
  expect(afterBody.user.jobFunction).toBe("Product manager");
});

test("POST /api/onboarding rejects duplicate team membership", async () => {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-me-2" } },
      response: null,
    }),
  }));

  const { handlePostOnboarding } = await import("./routes");
  const first = await handlePostOnboarding(
    new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName: "One", teamName: "Team" }),
    }),
  );
  expect(first.status).toBe(201);

  const second = await handlePostOnboarding(
    new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName: "Two", teamName: "Other" }),
    }),
  );
  expect(second.status).toBe(409);
});

test("team invite mint and accept add membership", async () => {
  const db = new Database(":memory:");
  ensureExedraSchema(db);

  const owner = await getOrCreateUser(db, "registry-owner");
  const joiner = await getOrCreateUser(db, "registry-joiner");
  const orgId = createOrg(db, { name: "Org", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: owner.id });

  const token = mintTeamMemberInvite(db, { teamId, createdByUserId: owner.id });
  expect(getInviteTeamId(db, token)).toBe(teamId);

  addTeamMember(db, teamId, joiner.id);
  expect(userHasAnyTeam(db, joiner.id)).toBe(true);
  expect(listTeamsForUser(db, joiner.id)[0]?.name).toBe("Team");

  addTeamMember(db, teamId, joiner.id);
  expect(listTeamsForUser(db, joiner.id)).toHaveLength(1);

  db.close();
});
