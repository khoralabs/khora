import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { maybeRegistryOptInOnStartup, registerHostWithRegistry } from "./registry-opt-in.ts";

describe("registry opt-in", () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "KHORA_REGISTRY_PARTICIPATE",
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
      async () => new Response(JSON.stringify({ host: { status: "pending" } }), { status: 201 }),
    );
    await registerHostWithRegistry({
      registryUrl: "http://localhost:4000",
      slug: "lab",
      baseUrl: "http://127.0.0.1:8788",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:4000/v1/hosts/register");
    expect(init.method).toBe("POST");
  });

  test("registerHostWithRegistry treats 409 as idempotent", async () => {
    const fetchImpl = mock(
      async () =>
        new Response(JSON.stringify({ error: "host slug already registered: lab" }), {
          status: 409,
        }),
    );
    await registerHostWithRegistry({
      registryUrl: "http://localhost:4000",
      slug: "lab",
      baseUrl: "http://127.0.0.1:8788",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("maybeRegistryOptInOnStartup skips when participation disabled", () => {
    delete process.env.KHORA_REGISTRY_PARTICIPATE;
    const fetchImpl = mock(async () => new Response(null, { status: 201 }));
    maybeRegistryOptInOnStartup();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("maybeRegistryOptInOnStartup skips without slug", () => {
    process.env.KHORA_REGISTRY_PARTICIPATE = "1";
    delete process.env.KHORA_HOST_SLUG;
    const fetchImpl = mock(async () => new Response(null, { status: 201 }));
    maybeRegistryOptInOnStartup();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
