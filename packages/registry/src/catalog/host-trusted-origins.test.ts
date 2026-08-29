import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { createRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
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

describe("host trusted origins", () => {
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

  test("listRegistryTrustedOrigins returns only active participating hosts with origins", async () => {
    await registerKhoraHost(db, { slug: "pending-host", baseUrl: "http://localhost:8789" });
    const active = (
      await activateKhoraHost(
        db,
        (
          await registerKhoraHost(db, { slug: "active-host", baseUrl: "http://localhost:8788" })
        ).host.id,
      )
    ).host;
    expect(await listRegistryTrustedOrigins(db)).toHaveLength(0);

    await replaceHostTrustedOrigins(db, active.id, ["http://localhost:8788"]);
    await setHostRegistryParticipation(db, active.id, true);
    expect(await listRegistryTrustedOrigins(db)).toEqual(["http://localhost:8788"]);
  });

  test("listRegistryTrustedOrigins includes multiple explicit origins", async () => {
    const active = (
      await activateKhoraHost(
        db,
        (
          await registerKhoraHost(db, { slug: "web", baseUrl: "http://localhost:8788" })
        ).host.id,
      )
    ).host;
    await replaceHostTrustedOrigins(db, active.id, [
      "http://localhost:8788",
      "https://khoralabs.com",
    ]);
    await setHostRegistryParticipation(db, active.id, true);
    expect(await listRegistryTrustedOrigins(db)).toEqual([
      "http://localhost:8788",
      "https://khoralabs.com",
    ]);
  });

  test("normalizeTrustedOrigin rejects path", () => {
    expect(() => normalizeTrustedOrigin("https://example.com/path")).toThrow(
      InvalidTrustedOriginError,
    );
  });

  test("replaceHostTrustedOrigins enforces quota", async () => {
    const active = (
      await activateKhoraHost(
        db,
        (
          await registerKhoraHost(db, { slug: "quota", baseUrl: "http://localhost:8788" })
        ).host.id,
      )
    ).host;
    await expect(
      replaceHostTrustedOrigins(db, active.id, [
        "https://a.example.com",
        "https://b.example.com",
        "https://c.example.com",
      ]),
    ).rejects.toThrow(OriginQuotaExceededError);
  });

  test("pending origin requests do not appear in listRegistryTrustedOrigins until approved", async () => {
    const active = (
      await activateKhoraHost(
        db,
        (
          await registerKhoraHost(db, { slug: "req", baseUrl: "http://localhost:8788" })
        ).host.id,
      )
    ).host;
    const request = await requestHostTrustedOrigin(db, active.id, "https://app.example.com");
    expect(await listRegistryTrustedOrigins(db)).toHaveLength(0);
    await approveHostTrustedOriginRequest(db, request.id);
    await setHostRegistryParticipation(db, active.id, true);
    expect(await listRegistryTrustedOrigins(db)).toEqual(["https://app.example.com"]);
  });

  test("requestHostTrustedOrigin enforces combined quota", async () => {
    const active = (
      await activateKhoraHost(
        db,
        (
          await registerKhoraHost(db, { slug: "req-quota", baseUrl: "http://localhost:8788" })
        ).host.id,
      )
    ).host;
    await replaceHostTrustedOrigins(db, active.id, ["https://a.example.com"]);
    await requestHostTrustedOrigin(db, active.id, "https://b.example.com");
    await expect(requestHostTrustedOrigin(db, active.id, "https://c.example.com")).rejects.toThrow(
      OriginQuotaExceededError,
    );
  });

  test("quota request must exceed current included and allows one pending request", async () => {
    const active = (
      await activateKhoraHost(
        db,
        (
          await registerKhoraHost(db, { slug: "quota-req", baseUrl: "http://localhost:8788" })
        ).host.id,
      )
    ).host;
    await expect(requestHostTrustedOriginQuota(db, active.id, 2)).rejects.toThrow(
      /must exceed current included/,
    );
    const request = await requestHostTrustedOriginQuota(db, active.id, 5);
    expect(request.requestedIncluded).toBe(5);
    expect((await readHostRegistryState(db, active.id))?.pendingQuotaRequest?.id).toBe(request.id);
    await expect(requestHostTrustedOriginQuota(db, active.id, 6)).rejects.toThrow(
      /quota request is already pending/,
    );
    await cancelHostTrustedOriginQuotaRequest(db, active.id, request.id);
    expect((await readHostRegistryState(db, active.id))?.pendingQuotaRequest).toBeNull();
  });

  test("approve and reject quota requests update included trusted origins", async () => {
    const active = (
      await activateKhoraHost(
        db,
        (
          await registerKhoraHost(db, { slug: "quota-approve", baseUrl: "http://localhost:8788" })
        ).host.id,
      )
    ).host;
    const rejected = await requestHostTrustedOriginQuota(db, active.id, 4);
    await rejectHostTrustedOriginQuotaRequest(db, rejected.id);
    expect((await findHostById(db, active.id))?.includedTrustedOrigins).toBe(2);

    const pending = await requestHostTrustedOriginQuota(db, active.id, 5);
    const { host } = await approveHostTrustedOriginQuotaRequest(db, pending.id);
    expect(host.includedTrustedOrigins).toBe(5);
    expect((await findHostById(db, active.id))?.includedTrustedOrigins).toBe(5);
  });
});
