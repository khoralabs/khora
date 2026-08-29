import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { createRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import { activateKhoraHost, registerKhoraHost, updateHostHealthCheck } from "./index";

describe("khora host health", () => {
  let db: ReturnType<typeof createRegistrySqliteDatabase>;
  let sqlite: Database;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    db = createRegistrySqliteDatabase(sqlite);
    await initRegistryDomainSchema(db);
  });

  afterEach(() => {
    void db.close();
    sqlite.close();
  });

  test("register defaults health paths and unknown status", async () => {
    const { host } = await registerKhoraHost(db, {
      slug: "lab",
      baseUrl: "http://localhost:8788",
    });
    expect(host.healthReadyPath).toBe("/ready");
    expect(host.healthPath).toBe("/health");
    expect(host.healthStatus).toBe("unknown");
    expect(host.healthCheckedAtMs).toBeNull();
  });

  test("register accepts custom health paths", async () => {
    const { host } = await registerKhoraHost(db, {
      slug: "lab",
      baseUrl: "http://localhost:8788",
      healthReadyPath: "readyz",
      healthPath: "/live",
    });
    expect(host.healthReadyPath).toBe("/readyz");
    expect(host.healthPath).toBe("/live");
  });

  test("updateHostHealthCheck persists probe result", async () => {
    const { host } = await registerKhoraHost(db, {
      slug: "lab",
      baseUrl: "http://localhost:8788",
    });
    const { host: active } = await activateKhoraHost(db, host.id);
    const updated = await updateHostHealthCheck(db, active.id, {
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
