import { describe, expect, test } from "bun:test";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import { type HostRouteDeps, handleRegister } from "@khoralabs/khora-server-http";

const registerBody = {
  did: "did:key:new-agent",
  metadata: { username: "newuser" },
};

function rateLimitersAlwaysOk(): HostRouteDeps["rateLimiters"] {
  const rateOk = { ok: true as const, retryAfterSec: 0 };
  const allow: HostRouteDeps["rateLimiters"]["registerIp"] = () => rateOk;
  return {
    registerIp: allow,
    registerDid: allow,
    postsDid: allow,
    topicsDid: allow,
    profileDid: allow,
    inboxDid: allow,
    inboxBindDid: allow,
    inboxUnboundIp: allow,
    defaultIp: allow,
    invitePreviewIp: allow,
    invitesListDid: allow,
  };
}

function deps(overrides: {
  populationLimit?: number;
  registeredCount: number;
  alreadyRegistered?: boolean;
}): HostRouteDeps {
  return {
    ctx: {
      hostSpec: {
        readEffective: () => ({
          registryUrl: "http://localhost:4000",
          publicBaseUrl: "http://127.0.0.1:8788",
          populationLimit: overrides.populationLimit,
        }),
      },
      adminStats: {
        registeredPrincipalCount: () => overrides.registeredCount,
      },
      host: {
        persistenceClient: {
          registrationExists: () => overrides.alreadyRegistered ?? false,
        },
        registerPrincipal: async () => {
          throw new Error("should not register when at capacity");
        },
      },
      lookupNormalizedUsernameForPrincipal: () => undefined,
      rollbackUsernameMapsAfterFailedRegistration: () => {},
      agentAccountStatus: {
        getStatus: () => undefined,
      },
    } as unknown as KhoraHostContext,
    rateLimiters: rateLimitersAlwaysOk(),
    adminTokenAuth: null,
  };
}

describe("register population limit", () => {
  test("returns 503 when at capacity", async () => {
    const res = await handleRegister(
      new Request("http://x/v1/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerBody),
      }),
      deps({ populationLimit: 2, registeredCount: 2 }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Host at population capacity");
  });

  test("allows registration below limit", async () => {
    const res = await handleRegister(
      new Request("http://x/v1/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerBody),
      }),
      deps({ populationLimit: 2, registeredCount: 1 }),
    );
    expect(res.status).not.toBe(503);
  });
});
