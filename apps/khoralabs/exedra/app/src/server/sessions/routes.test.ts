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
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
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

test("POST /api/sessions allows create while onboarding interview is pending", async () => {
  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-session-3" } },
      response: null,
    }),
  }));

  const { handlePostOnboarding } = await import("../onboarding/routes");
  const created = await handlePostOnboarding(
    new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName: "Org", teamName: "Team" }),
    }),
  );
  expect(created.status).toBe(201);
  const createdBody = (await created.json()) as {
    team: { id: string };
    onboardingSessionId: string;
  };

  const { handleCreateSession: createSessionHandler } = await import("./routes");
  const allowed = await createSessionHandler(
    new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: createdBody.team.id,
        topic: "Review",
      }),
    }),
  );
  expect(allowed.status).toBe(201);
  void createdBody.onboardingSessionId;
});

test("POST /api/sessions returns 403 when session_create permission is revoked", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const admin = await getOrCreateUser(db, "registry-session-4-admin");
  const member = await getOrCreateUser(db, "registry-session-4-member");
  const orgId = await createOrg(db, { name: "Org", ownerId: admin.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: admin.id });
  const { addTeamMember } = await import("../db/membership");
  addTeamMember(db, teamId, member.id);
  const { setTeamScopePermissions } = await import("../authz/grant-templates");
  const { TeamPermission } = await import("../../shared/authz/permissions");
  setTeamScopePermissions(db, teamId, [
    TeamPermission.Read,
    TeamPermission.Write,
    TeamPermission.MemberManage,
  ]);
  db.close();

  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-session-4-member" } },
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

  expect(res.status).toBe(403);
});

test("GET participant interview allows facilitator and denies participant", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const facilitator = await getOrCreateUser(db, "registry-fac-participant-chat");
  const participant = await getOrCreateUser(db, "registry-participant-chat");
  const orgId = await createOrg(db, { name: "Org", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: facilitator.id });
  const { createSession, getOrCreateInterviewThread } = await import("../db/sessions");
  const { grantSessionCreatorAccess, grantSessionParticipant } = await import("../authz/policy");
  const session = createSession(db, { teamId, topic: "Participant chat read" });
  grantSessionCreatorAccess(db, facilitator.id, session.id);
  grantSessionParticipant(db, participant.id, session.id);
  getOrCreateInterviewThread(db, { sessionId: session.id, userId: participant.id });
  db.close();

  const { mock } = await import("bun:test");
  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-fac-participant-chat" } },
      response: null,
    }),
  }));

  const { handleGetParticipantInterview } = await import("./routes");
  const facilitatorRes = await handleGetParticipantInterview(
    new Request("http://localhost/api/sessions/x/participants/y/interview"),
    session.id,
    participant.id,
  );
  expect(facilitatorRes.status).toBe(200);
  const facilitatorBody = (await facilitatorRes.json()) as {
    readOnly: boolean;
    participant: { userId: string };
  };
  expect(facilitatorBody.readOnly).toBe(true);
  expect(facilitatorBody.participant.userId).toBe(participant.id);

  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-participant-chat" } },
      response: null,
    }),
  }));

  const { handleGetParticipantInterview: getAsParticipant } = await import("./routes");
  const participantRes = await getAsParticipant(
    new Request("http://localhost/api/sessions/x/participants/y/interview"),
    session.id,
    facilitator.id,
  );
  expect(participantRes.status).toBe(403);
});

test("GET participant interview allows facilitator and denies participant", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const facilitator = await getOrCreateUser(db, "registry-fac-participant-chat");
  const participant = await getOrCreateUser(db, "registry-participant-chat");
  const _outsider = await getOrCreateUser(db, "registry-outsider-chat");
  const orgId = await createOrg(db, { name: "Org", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: facilitator.id });
  const { createSession, getOrCreateInterviewThread } = await import("../db/sessions");
  const { grantSessionCreatorAccess, grantSessionParticipant } = await import("../authz/policy");
  const session = createSession(db, { teamId, topic: "Participant chat read" });
  grantSessionCreatorAccess(db, facilitator.id, session.id);
  grantSessionParticipant(db, participant.id, session.id);
  getOrCreateInterviewThread(db, { sessionId: session.id, userId: participant.id });
  db.close();

  const { mock } = await import("bun:test");
  const { handleGetParticipantInterview } = await import("./routes");

  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-fac-participant-chat" } },
      response: null,
    }),
  }));

  const facilitatorRes = await handleGetParticipantInterview(
    new Request("http://localhost/api/sessions/x/participants/y/interview"),
    session.id,
    participant.id,
  );
  expect(facilitatorRes.status).toBe(200);
  const facilitatorBody = (await facilitatorRes.json()) as {
    readOnly: boolean;
    participant: { userId: string };
  };
  expect(facilitatorBody.readOnly).toBe(true);
  expect(facilitatorBody.participant.userId).toBe(participant.id);

  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-participant-chat" } },
      response: null,
    }),
  }));

  const { handleGetParticipantInterview: getParticipantInterviewAsParticipant } = await import(
    "./routes"
  );
  const participantRes = await getParticipantInterviewAsParticipant(
    new Request("http://localhost/api/sessions/x/participants/y/interview"),
    session.id,
    facilitator.id,
  );
  expect(participantRes.status).toBe(403);

  mock.module("../auth/require-session", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-outsider-chat" } },
      response: null,
    }),
  }));

  const { handleGetParticipantInterview: getParticipantInterviewAsOutsider } = await import(
    "./routes"
  );
  const outsiderRes = await getParticipantInterviewAsOutsider(
    new Request("http://localhost/api/sessions/x/participants/y/interview"),
    session.id,
    participant.id,
  );
  expect(outsiderRes.status).toBe(403);
});
