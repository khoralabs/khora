import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade-crypto";
import {
  approveDeviceAuthorization,
  consumeDeviceAuthorization,
  findMembershipByAccountAndHost,
  linkAgentToMembership,
  linkBetterAuthUser,
  listAgentLinksForMembership,
  unlinkAgentFromMembership,
  upsertMembership,
} from "@khoralabs/registry-accounts";
import {
  ensureRegistrySchema,
  getRegistryDatabase,
  resetRegistryDatabase,
} from "@khoralabs/registry-auth";
import { seedDefaultHost } from "@khoralabs/registry-catalog";
import { handleDeviceAuthorize, handleDeviceToken } from "./api/device";
import { handleLinkChallenge } from "./api/link";

describe("registry device flow", () => {
  beforeEach(async () => {
    resetRegistryDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
    const db = getRegistryDatabase();
    seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryDatabase();
  });

  test("authorize then token after approve", async () => {
    const authRes = await handleDeviceAuthorize(
      new Request("http://localhost/v1/device/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceApp: "test" }),
      }),
    );
    expect(authRes.status).toBe(200);
    const authJson = (await authRes.json()) as {
      device_code: string;
      user_code: string;
      verification_url: string;
      expires_in: number;
    };
    expect(authJson.verification_url).toContain("user_code=");
    expect(authJson.expires_in).toBeGreaterThan(0);

    const db = getRegistryDatabase();
    approveDeviceAuthorization(db, {
      userCode: authJson.user_code,
      sessionToken: "test-session-token-abc",
    });

    const pending = await handleDeviceToken(
      new Request("http://localhost/v1/device/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: "wrong-code" }),
      }),
    );
    expect(pending.status).toBe(404);

    const tokenRes = await handleDeviceToken(
      new Request("http://localhost/v1/device/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: authJson.device_code }),
      }),
    );
    expect(tokenRes.status).toBe(200);
    const tokenJson = (await tokenRes.json()) as { status: string; session_cookie: string };
    expect(tokenJson.status).toBe("approved");
    expect(tokenJson.session_cookie).toContain("better-auth.session_token=");

    const second = await handleDeviceToken(
      new Request("http://localhost/v1/device/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: authJson.device_code }),
      }),
    );
    expect(second.status).toBe(400);
  });

  test("consume marks device consumed", async () => {
    const db = getRegistryDatabase();
    const authRes = await handleDeviceAuthorize(
      new Request("http://localhost/v1/device/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const authJson = (await authRes.json()) as { device_code: string; user_code: string };
    approveDeviceAuthorization(db, {
      userCode: authJson.user_code,
      sessionToken: "sess-1",
    });
    const consumed = consumeDeviceAuthorization(db, authJson.device_code);
    expect(consumed?.status).toBe("consumed");
  });
});

describe("link challenge", () => {
  beforeEach(async () => {
    resetRegistryDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryDatabase();
  });

  test("returns challenge for did", async () => {
    const res = await handleLinkChallenge(
      new Request("http://localhost/v1/link/challenge?did=did:key:test"),
      new URL("http://localhost/v1/link/challenge?did=did:key:test"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { challengeId: string; expiresAtMs: number };
    expect(json.challengeId.length).toBeGreaterThan(0);
    expect(json.expiresAtMs).toBeGreaterThan(Date.now());
  });
});

describe("membership agent links", () => {
  beforeEach(async () => {
    resetRegistryDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    const db = getRegistryDatabase();
    await ensureRegistrySchema();
    seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    linkBetterAuthUser(db, { providerSubject: "user-1", email: "cli@test.com" });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryDatabase();
  });

  test("multiple agents per membership and unlink one", async () => {
    const db = getRegistryDatabase();
    const host = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    const account = linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "cli@test.com",
    });
    const didA = "did:key:z6MkMembershipTestA";
    const didB = "did:key:z6MkMembershipTestB";
    const membership = upsertMembership(db, { accountId: account.id, hostId: host.id });

    linkAgentToMembership(db, { membershipId: membership.id, agentDid: didA });
    linkAgentToMembership(db, { membershipId: membership.id, agentDid: didB });

    const links = listAgentLinksForMembership(db, membership.id);
    expect(links).toHaveLength(2);

    unlinkAgentFromMembership(db, membership.id, didA);
    const remaining = listAgentLinksForMembership(db, membership.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.agentDid).toBe(didB);
    expect(findMembershipByAccountAndHost(db, account.id, host.id)).not.toBeNull();
  });

  test("unlink last agent deletes membership", () => {
    const db = getRegistryDatabase();
    const host = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    const account = linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "cli@test.com",
    });
    const did = "did:key:z6MkMembershipTestOnly";
    const membership = upsertMembership(db, { accountId: account.id, hostId: host.id });

    linkAgentToMembership(db, { membershipId: membership.id, agentDid: did });
    unlinkAgentFromMembership(db, membership.id, did);
    expect(findMembershipByAccountAndHost(db, account.id, host.id)).toBeNull();
  });
});
