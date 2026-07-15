import { describe, expect, mock, test } from "bun:test";

import {
  claimHostRegistration,
  fetchHostRegistrationStatus,
  registerHostWithRegistryRemote,
} from "./registration";

const baseConfig = {
  registryUrl: "http://localhost:4000/",
  slug: "lab",
  publicBaseUrl: "http://127.0.0.1:8788",
  displayName: "Lab",
};

describe("registration client", () => {
  test("registerHostWithRegistryRemote maps success and posts body", async () => {
    const fetchImpl = mock(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            status: "pending",
            trustLevel: "manual",
            requirements: [{ id: "operator_approval", status: "pending" }],
            registrationSecret: "secret-1",
            slug: "lab",
            host: {
              registryParticipationEnabled: false,
              trustedOrigins: [],
              trustedOriginQuota: { used: 0, included: 1 },
            },
          }),
          { status: 201 },
        ),
    );

    const result = await registerHostWithRegistryRemote(
      baseConfig,
      fetchImpl as unknown as typeof fetch,
    );

    expect(result.status).toBe("pending");
    expect(result.registrationSecret).toBe("secret-1");
    expect(result.requirements?.[0]?.id).toBe("operator_approval");
    expect(result.serverOrigin).toBe("http://127.0.0.1:8788");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit?]>;
    const [url, init] = calls[0] ?? [];
    expect(url).toBe("http://localhost:4000/v1/hosts/register");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      slug: "lab",
      baseUrl: "http://127.0.0.1:8788",
      displayName: "Lab",
    });
  });

  test("registerHostWithRegistryRemote throws on error status", async () => {
    const fetchImpl = mock(
      async () =>
        new Response(JSON.stringify({ error: "host slug already registered: lab" }), {
          status: 409,
        }),
    );
    await expect(
      registerHostWithRegistryRemote(baseConfig, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow("host slug already registered: lab");
  });

  test("fetchHostRegistrationStatus requires registration secret", async () => {
    await expect(fetchHostRegistrationStatus(baseConfig)).rejects.toThrow(
      "Registration secret is not configured",
    );
  });

  test("fetchHostRegistrationStatus and claimHostRegistration call expected paths", async () => {
    const fetchImpl = mock(
      async (url: string) =>
        new Response(
          JSON.stringify({
            status: "active",
            managementToken: "mgmt-1",
            activated: url.includes("/claim"),
          }),
          { status: 200 },
        ),
    );
    const config = { ...baseConfig, registrationSecret: "reg-secret" };

    const status = await fetchHostRegistrationStatus(config, fetchImpl as unknown as typeof fetch);
    expect(status.managementToken).toBe("mgmt-1");
    expect(status.activated).toBe(false);

    const claimed = await claimHostRegistration(config, fetchImpl as unknown as typeof fetch);
    expect(claimed.activated).toBe(true);

    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit?]>;
    expect(calls[0]?.[0]).toBe("http://localhost:4000/v1/hosts/lab/registration");
    expect(calls[1]?.[0]).toBe("http://localhost:4000/v1/hosts/lab/registration/claim");
  });
});
