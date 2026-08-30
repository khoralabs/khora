import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initRegistryDomainSchema } from "@khoralabs/khora-registry/persistence";
import { createRegistrySqliteDatabase } from "@khoralabs/khora-registry/sqlite";
import { findHostByBaseUrl, normalizeKhoraHostBaseUrl, seedDefaultHost } from "./index";

describe("normalizeKhoraHostBaseUrl", () => {
  test("strips trailing slash and lowercases hostname", () => {
    expect(normalizeKhoraHostBaseUrl("HTTP://LOCALHOST:8787/")).toBe("http://loopback:8787");
  });

  test("unifies loopback aliases", () => {
    expect(normalizeKhoraHostBaseUrl("http://127.0.0.1:8787")).toBe(
      normalizeKhoraHostBaseUrl("http://localhost:8787"),
    );
  });

  test("rejects path", () => {
    expect(() => normalizeKhoraHostBaseUrl("http://localhost:8787/v1")).toThrow();
  });
});

describe("findHostByBaseUrl", () => {
  let db: ReturnType<typeof createRegistrySqliteDatabase>;
  let sqlite: Database;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    db = createRegistrySqliteDatabase(sqlite);
    await initRegistryDomainSchema(db);
    await seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
  });

  afterEach(() => {
    void db.close();
    sqlite.close();
  });

  test("matches loopback alias against seeded host", async () => {
    const host = await findHostByBaseUrl(db, "http://127.0.0.1:8788");
    expect(host?.slug).toBe("khora-local");
  });

  test("returns null when port differs", async () => {
    expect(await findHostByBaseUrl(db, "http://localhost:8787")).toBeNull();
  });
});
