import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  getUsersDatabase,
  initializeRegistrationRequirements,
  initUsersSchema,
  probeHostHealth,
  readRegistrationPolicyFromEnv,
  recordHostHealthProbe,
  registerKhoraHost,
  resetUsersDatabase,
} from "./index";

function registerLabHost() {
  const db = getUsersDatabase();
  const policy = readRegistrationPolicyFromEnv();
  return registerKhoraHost(db, {
    slug: "lab",
    baseUrl: "http://localhost:8788",
    registrationRequirements: initializeRegistrationRequirements(policy),
  });
}

describe("probeHostHealth", () => {
  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initUsersSchema(getUsersDatabase());
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetUsersDatabase();
  });

  test("ready 200 marks up with ready endpoint", async () => {
    const { host } = registerLabHost();
    const fetchImpl = async (url: string) => {
      expect(url).toBe("http://localhost:8788/ready");
      return new Response("ready", { status: 200 });
    };
    const result = await probeHostHealth(host, {
      timeoutMs: 1000,
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.status).toBe("up");
    expect(result.probedEndpoint).toBe("ready");
  });

  test("ready fail then health 200 marks up via health", async () => {
    const { host } = registerLabHost();
    const fetchImpl = async (url: string) => {
      if (url.endsWith("/ready")) {
        return new Response("not ready", { status: 503 });
      }
      expect(url).toBe("http://localhost:8788/health");
      return new Response("ok", { status: 200 });
    };
    const result = await probeHostHealth(host, {
      timeoutMs: 1000,
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.status).toBe("up");
    expect(result.probedEndpoint).toBe("health");
  });
});

describe("recordHostHealthProbe", () => {
  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initUsersSchema(getUsersDatabase());
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetUsersDatabase();
  });

  test("syncs health_check requirement with probe columns", () => {
    const db = getUsersDatabase();
    const { host } = registerLabHost();
    const updated = recordHostHealthProbe(db, host.id, {
      status: "up",
      latencyMs: 42,
      probedEndpoint: "ready",
    });
    expect(updated.healthStatus).toBe("up");
    expect(updated.healthLatencyMs).toBe(42);
    const healthReq = updated.registrationRequirements.find((item) => item.id === "health_check");
    expect(healthReq?.status).toBe("satisfied");
    expect(healthReq?.detail).toContain("ready");
  });

  test("failed probe marks requirement failed", () => {
    const db = getUsersDatabase();
    const { host } = registerLabHost();
    const updated = recordHostHealthProbe(db, host.id, {
      status: "down",
      latencyMs: null,
      probedEndpoint: null,
    });
    expect(updated.healthStatus).toBe("down");
    const healthReq = updated.registrationRequirements.find((item) => item.id === "health_check");
    expect(healthReq?.status).toBe("failed");
  });
});
