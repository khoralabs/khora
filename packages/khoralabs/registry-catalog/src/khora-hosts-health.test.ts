import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  activateKhoraHost,
  getRegistryCatalogDb,
  initCatalogSchema,
  registerKhoraHost,
  resetRegistryCatalogDb,
  updateHostHealthCheck,
} from "./index";

describe("khora host health", () => {
  beforeEach(async () => {
    resetRegistryCatalogDb();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initCatalogSchema(getRegistryCatalogDb());
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryCatalogDb();
  });

  test("register defaults health paths and unknown status", () => {
    const db = getRegistryCatalogDb();
    const { host } = registerKhoraHost(db, {
      slug: "lab",
      baseUrl: "http://localhost:8788",
    });
    expect(host.healthReadyPath).toBe("/ready");
    expect(host.healthPath).toBe("/health");
    expect(host.healthStatus).toBe("unknown");
    expect(host.healthCheckedAtMs).toBeNull();
  });

  test("register accepts custom health paths", () => {
    const db = getRegistryCatalogDb();
    const { host } = registerKhoraHost(db, {
      slug: "lab",
      baseUrl: "http://localhost:8788",
      healthReadyPath: "readyz",
      healthPath: "/live",
    });
    expect(host.healthReadyPath).toBe("/readyz");
    expect(host.healthPath).toBe("/live");
  });

  test("updateHostHealthCheck persists probe result", () => {
    const db = getRegistryCatalogDb();
    const { host } = registerKhoraHost(db, {
      slug: "lab",
      baseUrl: "http://localhost:8788",
    });
    const { host: active } = activateKhoraHost(db, host.id);
    const updated = updateHostHealthCheck(db, active.id, {
      status: "up",
      checkedAtMs: 1_700_000_000_000,
      latencyMs: 12,
      probedEndpoint: "ready",
    });
    expect(updated.healthStatus).toBe("up");
    expect(updated.healthLatencyMs).toBe(12);
    expect(updated.healthProbedEndpoint).toBe("ready");
    expect(updated.healthCheckedAtMs).toBe(1_700_000_000_000);
  });
});
