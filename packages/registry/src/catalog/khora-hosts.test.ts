import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initRegistryDomainSchema } from "@khoralabs/khora-registry/persistence";
import { createRegistrySqliteDatabase } from "@khoralabs/khora-registry/sqlite";
import { InvalidHostSlugError, normalizeHostSlug } from "./host-slug";
import { activateKhoraHost, listPublicHosts, registerKhoraHost } from "./khora-hosts";

describe("registerKhoraHost", () => {
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

  test("creates pending host not in public list until activated", async () => {
    const { host } = await registerKhoraHost(db, {
      slug: "my-host",
      baseUrl: "http://localhost:8788",
      displayName: "My Host",
    });
    expect(host.status).toBe("pending");
    expect(host.displayName).toBe("My Host");
    expect(await listPublicHosts(db)).toHaveLength(0);

    const { host: active } = await activateKhoraHost(db, host.id);
    expect(active.status).toBe("active");
    expect(await listPublicHosts(db)).toHaveLength(1);
  });

  test("rejects duplicate slug", async () => {
    await registerKhoraHost(db, { slug: "dup", baseUrl: "http://localhost:8788" });
    await expect(
      registerKhoraHost(db, { slug: "dup", baseUrl: "http://localhost:8789" }),
    ).rejects.toThrow(/slug already registered/);
  });

  test("normalizeHostSlug rejects invalid slugs", () => {
    expect(() => normalizeHostSlug("")).toThrow(InvalidHostSlugError);
    expect(() => normalizeHostSlug("Bad Slug")).toThrow(InvalidHostSlugError);
  });
});
