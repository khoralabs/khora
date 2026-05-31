import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getUsersDatabase, resetUsersDatabase } from "./db";
import {
  InvalidTrustedOriginError,
  listRegistryTrustedOrigins,
  normalizeTrustedOrigin,
  OriginQuotaExceededError,
  replaceHostTrustedOrigins,
  setHostRegistryParticipation,
} from "./host-trusted-origins";
import { activateKhoraHost, registerKhoraHost } from "./khora-hosts";
import { initUsersSchema } from "./schema";

describe("host trusted origins", () => {
  let db: ReturnType<typeof getUsersDatabase>;

  beforeEach(async () => {
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    resetUsersDatabase();
    db = getUsersDatabase();
    await initUsersSchema(db);
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
});
