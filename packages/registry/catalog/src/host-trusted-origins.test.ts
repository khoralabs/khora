import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getRegistryCatalogDb, resetRegistryCatalogDb } from "./db";
import {
  approveHostTrustedOriginQuotaRequest,
  approveHostTrustedOriginRequest,
  cancelHostTrustedOriginQuotaRequest,
  InvalidTrustedOriginError,
  listRegistryTrustedOrigins,
  normalizeTrustedOrigin,
  OriginQuotaExceededError,
  readHostRegistryState,
  rejectHostTrustedOriginQuotaRequest,
  replaceHostTrustedOrigins,
  requestHostTrustedOrigin,
  requestHostTrustedOriginQuota,
  setHostRegistryParticipation,
} from "./host-trusted-origins";
import { activateKhoraHost, findHostById, registerKhoraHost } from "./khora-hosts";
import { initCatalogSchema } from "./schema";

describe("host trusted origins", () => {
  let db: ReturnType<typeof getRegistryCatalogDb>;

  beforeEach(async () => {
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    resetRegistryCatalogDb();
    db = getRegistryCatalogDb();
    await initCatalogSchema(db);
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
  });

  test("listRegistryTrustedOrigins returns only active participating hosts with origins", () => {
    registerKhoraHost(db, { slug: "pending-host", baseUrl: "http://localhost:8789" });
    const active = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "active-host", baseUrl: "http://localhost:8788" }).host.id,
    ).host;
    expect(listRegistryTrustedOrigins(db)).toHaveLength(0);

    replaceHostTrustedOrigins(db, active.id, ["http://localhost:8788"]);
    setHostRegistryParticipation(db, active.id, true);
    expect(listRegistryTrustedOrigins(db)).toEqual(["http://localhost:8788"]);
  });

  test("listRegistryTrustedOrigins includes multiple explicit origins", () => {
    const active = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "web", baseUrl: "http://localhost:8788" }).host.id,
    ).host;
    replaceHostTrustedOrigins(db, active.id, ["http://localhost:8788", "https://khoralabs.com"]);
    setHostRegistryParticipation(db, active.id, true);
    expect(listRegistryTrustedOrigins(db)).toEqual([
      "http://localhost:8788",
      "https://khoralabs.com",
    ]);
  });

  test("normalizeTrustedOrigin rejects path", () => {
    expect(() => normalizeTrustedOrigin("https://example.com/path")).toThrow(
      InvalidTrustedOriginError,
    );
  });

  test("replaceHostTrustedOrigins enforces quota", () => {
    const active = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "quota", baseUrl: "http://localhost:8788" }).host.id,
    ).host;
    expect(() =>
      replaceHostTrustedOrigins(db, active.id, [
        "https://a.example.com",
        "https://b.example.com",
        "https://c.example.com",
      ]),
    ).toThrow(OriginQuotaExceededError);
  });

  test("pending origin requests do not appear in listRegistryTrustedOrigins until approved", () => {
    const active = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "req", baseUrl: "http://localhost:8788" }).host.id,
    ).host;
    const request = requestHostTrustedOrigin(db, active.id, "https://app.example.com");
    expect(listRegistryTrustedOrigins(db)).toHaveLength(0);
    approveHostTrustedOriginRequest(db, request.id);
    setHostRegistryParticipation(db, active.id, true);
    expect(listRegistryTrustedOrigins(db)).toEqual(["https://app.example.com"]);
  });

  test("requestHostTrustedOrigin enforces combined quota", () => {
    const active = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "req-quota", baseUrl: "http://localhost:8788" }).host.id,
    ).host;
    replaceHostTrustedOrigins(db, active.id, ["https://a.example.com"]);
    requestHostTrustedOrigin(db, active.id, "https://b.example.com");
    expect(() => requestHostTrustedOrigin(db, active.id, "https://c.example.com")).toThrow(
      OriginQuotaExceededError,
    );
  });

  test("quota request must exceed current included and allows one pending request", () => {
    const active = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "quota-req", baseUrl: "http://localhost:8788" }).host.id,
    ).host;
    expect(() => requestHostTrustedOriginQuota(db, active.id, 2)).toThrow(
      /must exceed current included/,
    );
    const request = requestHostTrustedOriginQuota(db, active.id, 5);
    expect(request.requestedIncluded).toBe(5);
    expect(readHostRegistryState(db, active.id)?.pendingQuotaRequest?.id).toBe(request.id);
    expect(() => requestHostTrustedOriginQuota(db, active.id, 6)).toThrow(
      /quota request is already pending/,
    );
    cancelHostTrustedOriginQuotaRequest(db, active.id, request.id);
    expect(readHostRegistryState(db, active.id)?.pendingQuotaRequest).toBeNull();
  });

  test("approve and reject quota requests update included trusted origins", () => {
    const active = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "quota-approve", baseUrl: "http://localhost:8788" }).host.id,
    ).host;
    const rejected = requestHostTrustedOriginQuota(db, active.id, 4);
    rejectHostTrustedOriginQuotaRequest(db, rejected.id);
    expect(findHostById(db, active.id)?.includedTrustedOrigins).toBe(2);

    const pending = requestHostTrustedOriginQuota(db, active.id, 5);
    const { host } = approveHostTrustedOriginQuotaRequest(db, pending.id);
    expect(host.includedTrustedOrigins).toBe(5);
    expect(findHostById(db, active.id)?.includedTrustedOrigins).toBe(5);
  });
});
