import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closeDb, getDb } from "../db/index";
import { getOrg, getTeam } from "../db/membership";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";

let dataDir: string;
let ownerId: string;
let memberId: string;
let orgId: string;
let teamId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-settings-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.INVITE_PEPPER = "test-pepper-settings";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  closeDb();

  const db = getDb();
  const owner = await getOrCreateUser(db, "owner@example.com");
  const member = await getOrCreateUser(db, "member@example.com");
  ownerId = owner.id;
  memberId = member.id;
  orgId = createOrg(db, { name: "Acme", ownerId });
  teamId = createTeam(db, { orgId, name: "Product", ownerId });
  db.prepare(`INSERT INTO team_members (team_id, user_id, created_at_ms) VALUES (?, ?, ?)`).run(
    teamId,
    memberId,
    Date.now(),
  );
});

afterEach(() => {
  closeDb();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.INVITE_PEPPER;
  delete process.env.EXEDRA_IDENTITY_KEY;
});

async function mockSession(registryUserId: string) {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: registryUserId } },
      response: null,
    }),
  }));
}

test("GET /api/orgs/:orgId/settings allows org members", async () => {
  await mockSession("member@example.com");
  const { handleGetOrgSettings } = await import("../orgs/routes");
  const res = await handleGetOrgSettings(new Request("http://localhost"), orgId);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { name: string; canEdit: boolean };
  expect(body.name).toBe("Acme");
  expect(body.canEdit).toBe(false);
});

test("PATCH /api/orgs/:orgId requires org owner", async () => {
  await mockSession("member@example.com");
  const { handlePatchOrg } = await import("../orgs/routes");
  const res = await handlePatchOrg(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    }),
    orgId,
  );
  expect(res.status).toBe(403);
});

test("GET /api/orgs/:orgId/members lists org members for members", async () => {
  await mockSession("member@example.com");
  const { handleListOrgMembers } = await import("../orgs/routes");
  const res = await handleListOrgMembers(new Request("http://localhost"), orgId);
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    members: { userId: string; isCurrentUser: boolean; teamNames: string[] }[];
  };
  expect(body.members).toHaveLength(2);
  expect(body.members.some((member) => member.isCurrentUser)).toBe(true);
  expect(body.members.every((member) => member.teamNames.includes("Product"))).toBe(true);
});

test("GET /api/orgs/:orgId/teams lists org teams for members", async () => {
  await mockSession("owner@example.com");
  const { handleListOrgTeams } = await import("../orgs/routes");
  const res = await handleListOrgTeams(new Request("http://localhost"), orgId);
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    teams: { id: string; name: string; memberCount: number }[];
  };
  expect(body.teams).toHaveLength(1);
  expect(body.teams[0]?.id).toBe(teamId);
  expect(body.teams[0]?.memberCount).toBe(2);
});

test("GET /api/teams/:teamId/members lists team members", async () => {
  await mockSession("member@example.com");
  const { handleListTeamMembers } = await import("../sessions/routes");
  const res = await handleListTeamMembers(new Request("http://localhost"), teamId);
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    members: { userId: string; isCurrentUser: boolean; fullName: string | null }[];
  };
  expect(body.members).toHaveLength(2);
  expect(body.members.some((member) => member.isCurrentUser)).toBe(true);
});

test("PATCH /api/orgs/:orgId updates name for owner", async () => {
  await mockSession("owner@example.com");
  const { handlePatchOrg } = await import("../orgs/routes");
  const res = await handlePatchOrg(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Corp" }),
    }),
    orgId,
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { name: string; canEdit: boolean };
  expect(body.name).toBe("Acme Corp");
  expect(body.canEdit).toBe(true);
  expect(getOrg(getDb(), orgId)?.name).toBe("Acme Corp");
});

test("GET /api/teams/:teamId/settings allows team members", async () => {
  await mockSession("member@example.com");
  const { handleGetTeamSettings } = await import("../teams/routes");
  const res = await handleGetTeamSettings(new Request("http://localhost"), teamId);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { name: string; canEdit: boolean };
  expect(body.name).toBe("Product");
  expect(body.canEdit).toBe(false);
});

test("PATCH /api/teams/:teamId requires team owner", async () => {
  await mockSession("member@example.com");
  const { handlePatchTeam } = await import("../teams/routes");
  const res = await handlePatchTeam(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed team" }),
    }),
    teamId,
  );
  expect(res.status).toBe(403);
});

test("PATCH /api/teams/:teamId updates name for owner", async () => {
  await mockSession("owner@example.com");
  const { handlePatchTeam } = await import("../teams/routes");
  const res = await handlePatchTeam(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Product Team" }),
    }),
    teamId,
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { name: string };
  expect(body.name).toBe("Product Team");
  expect(getTeam(getDb(), teamId)?.name).toBe("Product Team");
});

test("POST avatar upload returns 503 when S3 is not configured", async () => {
  await mockSession("owner@example.com");
  delete process.env.EXEDRA_DOCUMENTS_S3_BUCKET;

  const formData = new FormData();
  formData.set("file", new File([new Uint8Array([1, 2, 3])], "avatar.png", { type: "image/png" }));

  const { handleUploadOrgAvatar } = await import("../orgs/routes");
  const res = await handleUploadOrgAvatar(
    new Request("http://localhost", { method: "POST", body: formData }),
    orgId,
  );
  expect(res.status).toBe(503);
});
