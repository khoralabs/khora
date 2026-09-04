import { describe, expect, test } from "bun:test";
import {
  createMemoryNonceStore,
  createSignedRequestAuth,
  generateIdentity,
} from "@khoralabs/khora-auth";
import { discoverHost, KhoraClient, KhoraClientError } from "@khoralabs/khora-client";
import { KHORA_ERROR_CODE } from "@khoralabs/khora-contracts/http";
import type { KhoraHostContext } from "..";
import type { HostRouteDeps } from "./routes/deps";
import { createHostRouter } from "./routes/router";

const BASE = "http://boundary.test";

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

function createBoundaryDeps(opts?: {
  registered?: Set<string>;
  populationLimit?: number;
}): HostRouteDeps {
  const registered = opts?.registered ?? new Set<string>();
  const profiles = new Map<string, string>();
  const auth = createSignedRequestAuth({ nonceStore: createMemoryNonceStore() });

  return {
    ctx: {
      hostSpec: {
        readEffective: () => ({
          registryUrl: "http://localhost:4000",
          publicBaseUrl: BASE,
          populationLimit: opts?.populationLimit,
        }),
        read: () => undefined,
      },
      adminStats: {
        registeredPrincipalCount: () => registered.size,
      },
      search: undefined,
      host: {
        inboxHub: {},
        persistenceClient: {
          registrationExists: (did: string) => registered.has(did),
          upsertRegistration: (did: string, profileId: string) => {
            registered.add(did);
            profiles.set(did, profileId);
          },
          profileIdForPrincipal: (did: string) => profiles.get(did),
        },
        registerPrincipal: async (req: {
          principalId: string;
          metadata?: { username?: string };
        }) => {
          const profileId = `prof_${req.principalId.slice(-8)}`;
          return {
            principalId: req.principalId,
            profileId,
            profile: {
              id: profileId,
              username: req.metadata?.username ?? "agent",
            },
          };
        },
      },
      auth,
      lookupNormalizedUsernameForPrincipal: () => undefined,
      rollbackUsernameMapsAfterFailedRegistration: () => {},
      agentAccountStatus: {
        getStatus: () => undefined,
      },
      invitesRepo: undefined,
    } as unknown as KhoraHostContext,
    rateLimiters: rateLimitersAlwaysOk(),
    adminTokenAuth: null,
  };
}

function createBoundaryFetch(deps: HostRouteDeps) {
  const { routeUnary } = createHostRouter();
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const res = await routeUnary(req, url, deps);
    return res ?? new Response("Not found", { status: 404 });
  };
}

describe("host↔client boundary contracts", () => {
  test("health returns Zod-shaped JSON via KhoraClient", async () => {
    const signer = await generateIdentity();
    const deps = createBoundaryDeps();
    const client = new KhoraClient({
      baseUrl: BASE,
      signer,
      fetch: createBoundaryFetch(deps),
    });
    await expect(client.health()).resolves.toEqual({ ok: true });
  });

  test("discoverHost validates well-known features from host", async () => {
    const deps = createBoundaryDeps();
    const doc = await discoverHost({
      baseUrl: BASE,
      fetch: createBoundaryFetch(deps),
      requireFeatures: { search: false, inbox: true, invitesRequired: false },
    });
    expect(doc.version).toBe(1);
    expect(doc.baseUrl).toBe(BASE);
    expect(doc.endpoints.register).toBe("/v1/register");
    expect(doc.features).toEqual({
      search: false,
      invitesRequired: false,
      inbox: true,
    });
  });

  test("register succeeds and signed agent status returns not_registered code when unregistered", async () => {
    const signer = await generateIdentity();
    const deps = createBoundaryDeps();
    const fetch = createBoundaryFetch(deps);
    const client = new KhoraClient({ baseUrl: BASE, signer, fetch });

    try {
      await client.getAgentStatus();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).status).toBe(400);
      expect((e as KhoraClientError).code).toBe(KHORA_ERROR_CODE.not_registered);
    }

    const result = await client.register({ metadata: { username: "boundary" } });
    expect(result.did).toBe(signer.did);
    expect(result.profile.username).toBe("boundary");
  });

  test("register at capacity surfaces population_full code", async () => {
    const signer = await generateIdentity();
    const deps = createBoundaryDeps({
      registered: new Set(["did:key:other"]),
      populationLimit: 1,
    });
    const client = new KhoraClient({
      baseUrl: BASE,
      signer,
      fetch: createBoundaryFetch(deps),
    });

    try {
      await client.register({ metadata: { username: "full" } });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraClientError);
      expect((e as KhoraClientError).status).toBe(503);
      expect((e as KhoraClientError).code).toBe(KHORA_ERROR_CODE.population_full);
    }
  });
});
