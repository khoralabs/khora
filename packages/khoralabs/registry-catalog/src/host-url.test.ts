import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  findHostByBaseUrl,
  getRegistryCatalogDb,
  initCatalogSchema,
  normalizeKhoraHostBaseUrl,
  resetRegistryCatalogDb,
  seedDefaultHost,
} from "./index";

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
  beforeEach(async () => {
    resetRegistryCatalogDb();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    const db = getRegistryCatalogDb();
    await initCatalogSchema(db);
    seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryCatalogDb();
  });

  test("matches loopback alias against seeded host", () => {
    const db = getRegistryCatalogDb();
    const host = findHostByBaseUrl(db, "http://127.0.0.1:8788");
    expect(host?.slug).toBe("khora-local");
  });

  test("returns null when port differs", () => {
    const db = getRegistryCatalogDb();
    expect(findHostByBaseUrl(db, "http://localhost:8787")).toBeNull();
  });
});
