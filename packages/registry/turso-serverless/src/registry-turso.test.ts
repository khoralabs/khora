import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { findAccountByEmail, linkBetterAuthUser } from "@khoralabs/registry-accounts";
import { initRegistryDomainSchema } from "@khoralabs/registry-persistence";
import { tursoClientsFromBunSqlite } from "./testing/bun-sqlite-adapter";
import { createRegistryTursoDatabase } from "./turso-database";

describe("createRegistryTursoDatabase", () => {
  test("persists and reloads account rows", async () => {
    const sqlite = new Database(":memory:");
    const clients = tursoClientsFromBunSqlite(sqlite);
    const db = createRegistryTursoDatabase(clients);
    await initRegistryDomainSchema(db);

    const linked = await linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "alice@example.com",
    });

    const account = await findAccountByEmail(db, "alice@example.com");
    expect(account).not.toBeNull();
    expect(account?.id).toBe(linked.id);
  });
});

describe("Turso registry integration", () => {
  test.skip("requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN", () => {
    expect(true).toBe(true);
  });
});
