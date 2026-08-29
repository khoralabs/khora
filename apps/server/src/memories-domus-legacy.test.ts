import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveLocalSqliteDatabasePath } from "@khoralabs/memories-service/storage/sqlite";
import { KHORA_DOMUS_MEMORIES_DATABASE_ID } from "./memories-domus";
import {
  assertKhoraMemoriesDbPathUnset,
  KHORA_LEGACY_BARE_MEMORIES_FILENAME,
  migrateBareMemoriesSqliteIfNeeded,
  resolveLegacyBareMemoriesDbPath,
} from "./memories-domus-legacy";

describe("migrateBareMemoriesSqliteIfNeeded", () => {
  test("moves bare sqlite (+ sidecars) into encoded service path", () => {
    const root = mkdtempSync(path.join(tmpdir(), "khora-migrate-mem-"));
    try {
      const memoriesDataDir = path.join(root, "memories");
      const legacyDbPath = path.join(root, KHORA_LEGACY_BARE_MEMORIES_FILENAME);
      writeFileSync(legacyDbPath, "fake-db");
      writeFileSync(`${legacyDbPath}-wal`, "wal");
      writeFileSync(`${legacyDbPath}-shm`, "shm");

      const target = migrateBareMemoriesSqliteIfNeeded({
        memoriesDataDir,
        legacyDbPath,
        databaseId: KHORA_DOMUS_MEMORIES_DATABASE_ID,
      });

      expect(target).toBe(
        resolveLocalSqliteDatabasePath(memoriesDataDir, KHORA_DOMUS_MEMORIES_DATABASE_ID),
      );
      expect(existsSync(target)).toBe(true);
      expect(existsSync(`${target}-wal`)).toBe(true);
      expect(existsSync(`${target}-shm`)).toBe(true);
      expect(existsSync(legacyDbPath)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("no-op when target already exists", () => {
    const root = mkdtempSync(path.join(tmpdir(), "khora-migrate-mem-"));
    try {
      const memoriesDataDir = path.join(root, "memories");
      const legacyDbPath = path.join(root, KHORA_LEGACY_BARE_MEMORIES_FILENAME);
      const target = resolveLocalSqliteDatabasePath(
        memoriesDataDir,
        KHORA_DOMUS_MEMORIES_DATABASE_ID,
      );
      writeFileSync(legacyDbPath, "legacy");
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, "service");

      migrateBareMemoriesSqliteIfNeeded({ memoriesDataDir, legacyDbPath });
      expect(existsSync(legacyDbPath)).toBe(true);
      expect(readFileSync(target, "utf8")).toBe("service");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("assertKhoraMemoriesDbPathUnset", () => {
  test("passes when unset", () => {
    expect(() => assertKhoraMemoriesDbPathUnset({})).not.toThrow();
  });

  test("throws when set", () => {
    expect(() => assertKhoraMemoriesDbPathUnset({ KHORA_MEMORIES_DB_PATH: "/x.sqlite" })).toThrow(
      /KHORA_MEMORIES_DB_PATH is no longer supported/,
    );
  });
});

describe("resolveLegacyBareMemoriesDbPath", () => {
  test("joins dataDir and bare filename", () => {
    expect(resolveLegacyBareMemoriesDbPath("/data")).toBe(
      path.join("/data", KHORA_LEGACY_BARE_MEMORIES_FILENAME),
    );
  });
});
