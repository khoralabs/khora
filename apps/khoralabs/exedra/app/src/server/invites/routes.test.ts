import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyRegistrySession } from "@khoralabs/registry-auth";
import { listAccountRowsForSession } from "../accounts/resolve-rows";
import { canReadPersonalKg, grantSessionCreatorAccess, hasGrant } from "../authz";
import { closeDb, getDb } from "../db/index";
import { mintSessionParticipantInvite } from "../db/invites";
import { getPendingOnboardingInterview, listTeamsForUser } from "../db/membership";
import { hasPersonalMemoryConsent } from "../db/session-participants";
import { createOrg, createSession, createTeam, userHasSessionAccess } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { resetMemoriesStoreForTests } from "../memories/store";
import { createOnboardingInterviewForMember } from "../onboarding/interview";
import { getStubRegistryOtp } from "../registry-stub/config";
import {
  handleStubGetSession,
  handleStubSendVerificationOtp,
  handleStubSignInEmailOtp,
} from "../registry-stub/handlers";
import { resetStubRegistryStore } from "../registry-stub/store";
import { handleAcceptInvite, handleGetInvite } from "./routes";

function sessionAcceptRequest(
  token: string,
  cookie: string,
  personalMemoryConsent: boolean,
): Request {
  return new Request(`${BASE}/api/invites/${token}/accept`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ personalMemoryConsent }),
  });
}

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
  const orgId = await createOrg(db, { name: "Org", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: facilitator.id });
  const session = createSession(db, {
    teamId,
    topic: "Review",
  });
  await grantSessionCreatorAccess(facilitator.id, session.id);
  const token = mintSessionParticipantInvite(db, {
    sessionId: session.id,
    teamId,
    createdByUserId: facilitator.id,
  });

  const { cookie, registryUserId } = await signInCookie("participant@exedra.test");
  const participant = await getOrCreateUser(db, registryUserId);
  const { grantSessionParticipant } = await import("../authz");
  await grantSessionParticipant(participant.id, session.id);

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
});

test("accept invite grants session access and team membership", async () => {
  const db = getDb();
  const facilitator = await getOrCreateUser(db, "registry-fac-accept");
  const orgId = await createOrg(db, { name: "OrgAccept", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "TeamAccept", ownerId: facilitator.id });
  const session = createSession(db, {
    teamId,
    topic: "Quarterly review",
  });
  await grantSessionCreatorAccess(facilitator.id, session.id);
  const token = mintSessionParticipantInvite(db, {
    sessionId: session.id,
    teamId,
    createdByUserId: facilitator.id,
  });

  const { cookie, registryUserId } = await signInCookie("new-invitee@exedra.test");
  const invitee = await getOrCreateUser(db, registryUserId);
  expect(await listTeamsForUser(db, invitee.id)).toHaveLength(0);

  const res = await handleAcceptInvite(sessionAcceptRequest(token, cookie, true), token);

  expect(res.status).toBe(200);
  const body = (await res.json()) as { redirectTo: string };
  expect(body.redirectTo).toBe(`/sessions/${session.id}/interview`);
  expect(await listTeamsForUser(db, invitee.id)).toHaveLength(1);
  const teams = await listTeamsForUser(db, invitee.id);
  expect(teams[0]?.id).toBe(teamId);
  expect(await userHasSessionAccess(db, session.id, invitee.id)).toBe(true);
  expect(
    await hasGrant(
      { type: "account", id: invitee.id },
      { type: "session", id: session.id },
      "participant",
    ),
  ).toBe(true);

  const participants = await listAccountRowsForSession(db, session.id, facilitator.id);
  expect(participants.some((p) => p.account.userId === invitee.id)).toBe(true);
  expect(await canReadPersonalKg(orgId, invitee.id)).toBe(true);
  expect(hasPersonalMemoryConsent(db, session.id, invitee.id)).toBe(true);
});

test("accept session invite requires personal memory consent", async () => {
  const db = getDb();
  const facilitator = await getOrCreateUser(db, "registry-fac-consent");
  const orgId = await createOrg(db, { name: "OrgConsent", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "TeamConsent", ownerId: facilitator.id });
  const session = createSession(db, { teamId, topic: "Consent check" });
  await grantSessionCreatorAccess(facilitator.id, session.id);
  const token = mintSessionParticipantInvite(db, {
    sessionId: session.id,
    teamId,
    createdByUserId: facilitator.id,
  });

  const { cookie } = await signInCookie("consent-invitee@exedra.test");
  const res = await handleAcceptInvite(sessionAcceptRequest(token, cookie, false), token);
  expect(res.status).toBe(400);
});

test("accept onboarding session invite joins facilitator session", async () => {
  const db = getDb();
  const facilitator = await getOrCreateUser(db, "registry-fac-onboard");
  const orgId = await createOrg(db, { name: "Onboard Org", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "Onboard Team", ownerId: facilitator.id });
  const onboarding = await createOnboardingInterviewForMember(db, {
    teamId,
    userId: facilitator.id,
    orgName: "Onboard Org",
    teamName: "Onboard Team",
  });

  const token = mintSessionParticipantInvite(db, {
    sessionId: onboarding.sessionId,
    teamId,
    createdByUserId: facilitator.id,
  });

  const { cookie, registryUserId } = await signInCookie("onboard-invitee@exedra.test");
  const invitee = await getOrCreateUser(db, registryUserId);

  const res = await handleAcceptInvite(sessionAcceptRequest(token, cookie, true), token);

  expect(res.status).toBe(200);
  const body = (await res.json()) as { redirectTo: string };
  expect(body.redirectTo).toBe(`/sessions/${onboarding.sessionId}/interview`);
  expect(await userHasSessionAccess(db, onboarding.sessionId, invitee.id)).toBe(true);
  expect(getPendingOnboardingInterview(db, invitee.id)?.sessionId).toBe(onboarding.sessionId);

  const participants = await listAccountRowsForSession(db, onboarding.sessionId, facilitator.id);
  expect(participants.some((p) => p.account.userId === facilitator.id)).toBe(true);
  expect(participants.some((p) => p.account.userId === invitee.id)).toBe(true);
});

test("get invite marks already joined for authenticated participant", async () => {
  const db = getDb();
  const facilitator = await getOrCreateUser(db, "registry-fac-get");
  const orgId = await createOrg(db, { name: "Org2", ownerId: facilitator.id });
  const teamId = await createTeam(db, { orgId, name: "Team2", ownerId: facilitator.id });
  const session = createSession(db, {
    teamId,
    topic: "Sync",
  });
  await grantSessionCreatorAccess(facilitator.id, session.id);
  const token = mintSessionParticipantInvite(db, {
    sessionId: session.id,
    teamId,
    createdByUserId: facilitator.id,
  });

  const { cookie, registryUserId } = await signInCookie("participant-get@exedra.test");
  const participant = await getOrCreateUser(db, registryUserId);
  const { grantSessionParticipant } = await import("../authz");
  await grantSessionParticipant(participant.id, session.id);

  const res = await handleGetInvite(
    new Request(`${BASE}/api/invites/${token}`, { headers: { cookie } }),
    token,
  );

  expect(res.status).toBe(200);
  const body = (await res.json()) as { alreadyJoined?: boolean; redirectTo?: string };
  expect(body.alreadyJoined).toBe(true);
  expect(body.redirectTo).toBe(`/sessions/${session.id}/interview`);
});

test("accept team invite grants membership", async () => {
  const db = getDb();
  const owner = await getOrCreateUser(db, "registry-team-owner");
  const orgId = await createOrg(db, { name: "OrgJoin", ownerId: owner.id });
  const teamId = await createTeam(db, { orgId, name: "JoinTeam", ownerId: owner.id });
  const { mintTeamMemberInvite } = await import("../db/invites");
  const token = mintTeamMemberInvite(db, { teamId, createdByUserId: owner.id });

  const { cookie, registryUserId } = await signInCookie("team-joiner@exedra.test");
  const joiner = await getOrCreateUser(db, registryUserId);
  expect(await listTeamsForUser(db, joiner.id)).toHaveLength(0);

  const res = await handleAcceptInvite(
    new Request(`${BASE}/api/invites/${token}/accept`, {
      method: "POST",
      headers: { cookie },
    }),
    token,
  );

  expect(res.status).toBe(200);
  const body = (await res.json()) as { redirectTo: string; invite: { kind: string } };
  expect(body.invite.kind).toBe("team");
  expect(await listTeamsForUser(db, joiner.id)).toHaveLength(1);
  const joinerTeams = await listTeamsForUser(db, joiner.id);
  expect(joinerTeams[0]?.name).toBe("JoinTeam");

  const second = await handleAcceptInvite(
    new Request(`${BASE}/api/invites/${token}/accept`, {
      method: "POST",
      headers: { cookie },
    }),
    token,
  );
  expect(second.status).toBe(200);
  const secondBody = (await second.json()) as { alreadyJoined?: boolean };
  expect(secondBody.alreadyJoined).toBe(true);
});
