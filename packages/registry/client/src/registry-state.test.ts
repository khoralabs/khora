import { describe, expect, mock, test } from "bun:test";

import { mergeRegistryOrigins, readServerPublicOrigin } from "./config";
import {
  cancelHostTrustedOriginRequestRemote,
  fetchHostRegistryState,
  requestHostTrustedOriginRemote,
} from "./registry-state";
import { syncHostRegistryOnStartup } from "./sync";

const baseConfig = {
  registryUrl: "http://localhost:4000",
  slug: "lab",
  publicBaseUrl: "https://host.example.com:8443/khora",
  managementToken: "mgmt-token",
  trustBaseUrlOrigin: true,
};

const registryJson = {
  slug: "lab",
  status: "active",
  registryParticipationEnabled: true,
  trustedOrigins: ["https://app.example.com"],
  pendingOriginRequests: [
    {
      id: "req-1",
      hostId: "h1",
      origin: "https://pending.example.com",
      status: "pending",
      requestedAtMs: 1,
      reviewedAtMs: null,
    },
  ],
  pendingQuotaRequest: null,
  trustedOriginQuota: { used: 1, pending: 0, included: 3 },
};

describe("registry-state client", () => {
  test("readServerPublicOrigin and mergeRegistryOrigins", () => {
    expect(readServerPublicOrigin(baseConfig)).toBe("https://host.example.com:8443");
    expect(mergeRegistryOrigins(baseConfig, ["https://app.example.com"])).toEqual([
      "https://app.example.com",
      "https://host.example.com:8443",
    ]);
    expect(
      mergeRegistryOrigins({ ...baseConfig, trustBaseUrlOrigin: false }, ["https://a"]),
    ).toEqual(["https://a"]);
  });

  test("fetchHostRegistryState maps wire fields into client state", async () => {
    const fetchImpl = mock(async () => new Response(JSON.stringify(registryJson), { status: 200 }));
    const state = await fetchHostRegistryState(baseConfig, fetchImpl as unknown as typeof fetch);
    expect(state.participationEnabled).toBe(true);
    expect(state.origins).toEqual(["https://app.example.com"]);
    expect(state.pendingOriginRequests[0]?.origin).toBe("https://pending.example.com");
    expect(state.quota).toEqual({ used: 1, pending: 0, included: 3 });
    expect(state.serverOrigin).toBe("https://host.example.com:8443");
    expect(state.trustBaseUrlOriginConfigured).toBe(true);
  });

  test("requestHostTrustedOriginRemote posts then re-fetches state", async () => {
    const fetchImpl = mock(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(registryJson), { status: 200 });
    });
    const state = await requestHostTrustedOriginRemote(
      baseConfig,
      "https://new.example.com",
      fetchImpl as unknown as typeof fetch,
    );
    expect(state.slug).toBe("lab");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit?]>;
    expect(calls[0]?.[0]).toContain("/registry/origin-requests");
  });

  test("cancelHostTrustedOriginRequestRemote maps DELETE body", async () => {
    const fetchImpl = mock(async () => new Response(JSON.stringify(registryJson), { status: 200 }));
    const state = await cancelHostTrustedOriginRequestRemote(
      baseConfig,
      "req-1",
      fetchImpl as unknown as typeof fetch,
    );
    expect(state.pendingOriginRequests).toHaveLength(1);
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit?]>;
    expect(calls[0]?.[0]).toContain("/registry/origin-requests/req-1");
  });

  test("syncHostRegistryOnStartup no-ops when trustBaseUrlOrigin is false", async () => {
    const fetchImpl = mock(async () => new Response("{}", { status: 200 }));
    await syncHostRegistryOnStartup(
      { ...baseConfig, trustBaseUrlOrigin: false },
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("syncHostRegistryOnStartup requests origin when missing", async () => {
    const fetchImpl = mock(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(registryJson), { status: 200 });
    });
    await syncHostRegistryOnStartup(baseConfig, fetchImpl as unknown as typeof fetch);
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit?]>;
    const postCall = calls.find((call) => call[1]?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      origin: "https://host.example.com:8443",
    });
  });
});
