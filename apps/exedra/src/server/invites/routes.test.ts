import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyRegistrySession } from "@khoralabs/registry-auth";
import { closeDb, getDb } from "../db/index";
import { mintSessionInvite } from "../db/invites";
import { listTeamsForUser } from "../db/membership";
import { addSessionParticipants, createOrg, createSession, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { resetMemoriesStoreForTests } from "../memories/store";
import { getStubRegistryOtp } from "../registry-stub/config";
import {
  handleStubGetSession,
  handleStubSendVerificationOtp,
  handleStubSignInEmailOtp,
} from "../registry-stub/handlers";
import { resetStubRegistryStore } from "../registry-stub/store";
import { handleAcceptInvite, handleGetInvite } from "./routes";

const BASE = "http://localhost:3000";

let dataDir: string;
const origFetch = globalThis.fetch;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-invite-routes-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.INVITE_PEPPER = "test-pepper-invite-routes";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY = "test-memories-key-invites";
  process.env.BUN_PUBLIC_EXEDRA_REGISTRY_URL = BASE;
  process.env.EXEDRA_STUB_REGISTRY = "1";
  resetStubRegistryStore();
  resetMemoriesStoreForTests();
  closeDb();
});

afterEach(() => {
  closeDb();
  resetMemoriesStoreForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.INVITE_PEPPER;
  delete process.env.EXEDRA_IDENTITY_KEY;
  delete process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY;
  delete process.env.BUN_PUBLIC_EXEDRA_REGISTRY_URL;
  delete process.env.EXEDRA_STUB_REGISTRY;
  resetStubRegistryStore();
  globalThis.fetch = origFetch;
});

async function stubFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const path = new URL(req.url).pathname;
  if (path === "/api/auth/email-otp/send-verification-otp") {
    return handleStubSendVerificationOtp(req);
  }
  if (path === "/api/auth/sign-in/email-otp") {
    return handleStubSignInEmailOtp(req);
  }
  if (path === "/api/auth/get-session") {
    return handleStubGetSession(req);
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

async function signInCookie(email: string): Promise<{ cookie: string; registryUserId: string }> {
  globalThis.fetch = stubFetch as unknown as typeof fetch;
  await handleStubSendVerificationOtp(
    new Request(`${BASE}/api/auth/email-otp/send-verification-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, type: "sign-in" }),
    }),
  );
  const signIn = await handleStubSignInEmailOtp(
    new Request(`${BASE}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp: getStubRegistryOtp() }),
    }),
  );
  const cookie = signIn.headers.getSetCookie?.()[0]?.split(";")[0];
  if (cookie === undefined) throw new Error("missing session cookie");

  const session = await verifyRegistrySession(
    new Request(`${BASE}/api/auth/get-session`, { headers: { cookie } }),
    { registryUrl: BASE, fetchImpl: stubFetch as typeof fetch },
  );
  if (session === null) throw new Error("missing registry session");

  return { cookie, registryUserId: session.user.id };
}

test("accept invite redirects when user already joined session", async () => {
  const db = getDb();
  const facilitator = await getOrCreateUser(db, "registry-fac-route");
  const orgId = createOrg(db, { name: "Org", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: facilitator.id });
  const session = createSession(db, {
    teamId,
    topic: "Review",
    facilitatorId: facilitator.id,
  });
  const token = mintSessionInvite(db, session.id);

  const { cookie, registryUserId } = await signInCookie("participant@exedra.test");
  const participant = await getOrCreateUser(db, registryUserId);
  addSessionParticipants(db, session.id, [participant.id]);

  const res = await handleAcceptInvite(
    new Request(`${BASE}/api/invites/${token}/accept`, {
      method: "POST",
      headers: { cookie },
    }),
    token,
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { alreadyJoined?: boolean; redirectTo: string };
  expect(body.alreadyJoined).toBe(true);
  expect(body.redirectTo).toBe(`/sessions/${session.id}/interview`);
  const teams = listTeamsForUser(db, participant.id);
  expect(teams.some((team) => team.id === teamId)).toBe(true);
});

test("accept invite adds invitee to session team and redirects to interview", async () => {
  const db = getDb();
  const facilitator = await getOrCreateUser(db, "registry-fac-accept");
  const orgId = createOrg(db, { name: "OrgAccept", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "TeamAccept", ownerId: facilitator.id });
  const session = createSession(db, {
    teamId,
    topic: "Quarterly review",
    facilitatorId: facilitator.id,
  });
  const token = mintSessionInvite(db, session.id);

  const { cookie, registryUserId } = await signInCookie("new-invitee@exedra.test");
  const invitee = await getOrCreateUser(db, registryUserId);
  expect(listTeamsForUser(db, invitee.id)).toHaveLength(0);

  const res = await handleAcceptInvite(
    new Request(`${BASE}/api/invites/${token}/accept`, {
      method: "POST",
      headers: { cookie },
    }),
    token,
  );

  expect(res.status).toBe(200);
  const body = (await res.json()) as { redirectTo: string };
  expect(body.redirectTo).toBe(`/sessions/${session.id}/interview`);
  expect(listTeamsForUser(db, invitee.id).some((team) => team.id === teamId)).toBe(true);
  expect(session.facilitatorId).toBe(facilitator.id);
  expect(session.facilitatorId).not.toBe(invitee.id);
});

test("get invite marks already joined for authenticated participant", async () => {
  const db = getDb();
  const facilitator = await getOrCreateUser(db, "registry-fac-get");
  const orgId = createOrg(db, { name: "Org2", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team2", ownerId: facilitator.id });
  const session = createSession(db, {
    teamId,
    topic: "Sync",
    facilitatorId: facilitator.id,
  });
  const token = mintSessionInvite(db, session.id);

  const { cookie, registryUserId } = await signInCookie("participant-get@exedra.test");
  const participant = await getOrCreateUser(db, registryUserId);
  addSessionParticipants(db, session.id, [participant.id]);

  const res = await handleGetInvite(
    new Request(`${BASE}/api/invites/${token}`, { headers: { cookie } }),
    token,
  );

  expect(res.status).toBe(200);
  const body = (await res.json()) as { alreadyJoined?: boolean; redirectTo?: string };
  expect(body.alreadyJoined).toBe(true);
  expect(body.redirectTo).toBe(`/sessions/${session.id}/interview`);
});
