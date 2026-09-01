import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { KhoraHostSpec } from "@khoralabs/khora-contracts";
import type { KhoraHostSpecPort } from "..";
import { maybeRegistryOptInOnStartup, registerHostWithRegistry } from "./registry-opt-in";

function createMockHostSpec(overrides: Partial<KhoraHostSpecPort> = {}): KhoraHostSpecPort {
  let stored: KhoraHostSpec | null = null;
  return {
    read: () => stored,
    readEffective: () => ({
      registryUrl: "http://localhost:4000",
      slug: stored?.slug,
      publicBaseUrl: "http://127.0.0.1:8788",
      displayName: stored?.displayName,
      populationLimit: stored?.populationLimit,
      registrationSecret: stored?.registrationSecret,
      managementToken: stored?.managementToken,
    }),
    patch: (patch) => {
      const next: KhoraHostSpec = { ...(stored ?? {}), updatedAtMs: Date.now() };
      if (patch.registryUrl !== undefined) next.registryUrl = patch.registryUrl;
      if (patch.slug !== undefined) next.slug = patch.slug;
      if (patch.publicBaseUrl !== undefined) next.publicBaseUrl = patch.publicBaseUrl;
      if (patch.displayName !== undefined) next.displayName = patch.displayName;
      if (patch.populationLimit === null) {
        delete next.populationLimit;
      } else if (patch.populationLimit !== undefined) {
        next.populationLimit = patch.populationLimit;
      }
      stored = next;
      return next;
    },
    storeSecrets: (secrets) => {
      const next: KhoraHostSpec = { ...(stored ?? {}), ...secrets, updatedAtMs: Date.now() };
      if (secrets.managementToken !== undefined) {
        delete next.registrationSecret;
      }
      stored = next;
      return next;
    },
    clearRegistrationSecret: () => {
      if (stored !== null) {
        delete stored.registrationSecret;
      }
      return stored ?? { updatedAtMs: Date.now() };
    },
    ...overrides,
  };
}

describe("registry opt-in", () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "KHORA_HOST_SLUG",
      "KHORA_REGISTRY_URL",
      "KHORA_PUBLIC_BASE_URL",
      "PORT",
      "KHORA_HOST_DISPLAY_NAME",
    ] as const) {
      prev[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });

  test("registerHostWithRegistry treats 201 as success", async () => {
    const fetchImpl = mock(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ host: { status: "pending" } }), { status: 201 }),
    );
    await registerHostWithRegistry({
      registryUrl: "http://localhost:4000",
      slug: "lab",
      baseUrl: "http://127.0.0.1:8788",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/v1/hosts/register");
    expect((call?.[1] as RequestInit | undefined)?.method).toBe("POST");
  });

  test("registerHostWithRegistry treats 409 as idempotent", async () => {
    const fetchImpl = mock(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ error: "host slug already registered: lab" }), {
          status: 409,
        }),
    );
    await registerHostWithRegistry({
      registryUrl: "http://localhost:4000",
      slug: "lab",
      baseUrl: "http://127.0.0.1:8788",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("maybeRegistryOptInOnStartup skips when no stored slug", () => {
    const fetchImpl = mock(async () => new Response(null, { status: 201 }));
    maybeRegistryOptInOnStartup(createMockHostSpec());
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("maybeRegistryOptInOnStartup registers when stored slug is present", async () => {
    const fetchImpl = mock(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ host: { status: "pending" } }), { status: 201 }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const hostSpec = createMockHostSpec();
      hostSpec.patch({ slug: "lab", registryUrl: "http://localhost:4000" });
      maybeRegistryOptInOnStartup(hostSpec);
      await Bun.sleep(20);
      expect(fetchImpl).toHaveBeenCalled();
      const call = fetchImpl.mock.calls[0];
      expect(call?.[0]).toBe("http://localhost:4000/v1/hosts/register");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
