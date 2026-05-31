import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import { getRegistryCatalogDb, registryDatabasePath, resetRegistryCatalogDb } from "./db";

describe("registryDatabasePath", () => {
  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryCatalogDb();
  });

  test("passes through :memory: without creating a disk file", () => {
    const accidental = join(process.cwd(), ":memory:");
    if (existsSync(accidental)) rmSync(accidental);

    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    expect(registryDatabasePath()).toBe(":memory:");
    getRegistryCatalogDb();
    expect(existsSync(accidental)).toBe(false);
  });
});
