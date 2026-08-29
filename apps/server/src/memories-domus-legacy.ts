/**
 * Transitional Domus cutover (bare `khora-memories.sqlite` → memories-service layout).
 * Remove this entire module (and call sites listed below) in the next minor version.
 *
 * Call sites to delete with this file:
 * - persistence-paths `legacyMemoriesDbPath`
 * - memories-env `legacyDbPath`
 * - bootstrap migrate + assert
 * - validateEnv assert
 * - memories-domus-legacy.test.ts
 */
import { existsSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { resolveLocalSqliteDatabasePath } from "@khoralabs/memories-service/storage/sqlite";
import {
  KHORA_DOMUS_MEMORIES_DATABASE_ID,
  type KhoraDomusMemoriesDatabaseId,
} from "./memories-domus";

/** Bare Domus sqlite filename under `{KHORA_DATA_DIR}` (migration source only). */
export const KHORA_LEGACY_BARE_MEMORIES_FILENAME = "khora-memories.sqlite";

/** Fixed bare path `{dataDir}/khora-memories.sqlite`. */
export function resolveLegacyBareMemoriesDbPath(dataDir: string): string {
  return path.join(dataDir, KHORA_LEGACY_BARE_MEMORIES_FILENAME);
}

/**
 * Reject the removed `KHORA_MEMORIES_DB_PATH` override.
 * Domus opens under `{KHORA_DATA_DIR}/memories` with id {@link KHORA_DOMUS_MEMORIES_DATABASE_ID}.
 */
export function assertKhoraMemoriesDbPathUnset(env: NodeJS.ProcessEnv = process.env): void {
  if (env.KHORA_MEMORIES_DB_PATH?.trim()) {
    throw new Error(
      'KHORA_MEMORIES_DB_PATH is no longer supported; unset it. Domus uses {KHORA_DATA_DIR}/memories (database id { kind: "host", ownerKey: "khora" }).',
    );
  }
}

function sidecarPaths(dbPath: string): string[] {
  return [`${dbPath}-wal`, `${dbPath}-shm`];
}

/**
 * One-shot migrate bare `{KHORA_DATA_DIR}/khora-memories.sqlite` into the
 * memories-service encoded layout under `dataDir`.
 * Returns the target `database.db` path (may not exist yet — opened by the stack).
 *
 * @deprecated Transitional cutover helper. Remove in the next minor version once
 * hosts have migrated off the bare sqlite path (delete this module).
 */
export function migrateBareMemoriesSqliteIfNeeded(opts: {
  memoriesDataDir: string;
  legacyDbPath: string;
  databaseId?: KhoraDomusMemoriesDatabaseId;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}): string {
  const databaseId = opts.databaseId ?? KHORA_DOMUS_MEMORIES_DATABASE_ID;
  const target = resolveLocalSqliteDatabasePath(opts.memoriesDataDir, databaseId);
  const log = opts.log ?? (() => {});

  if (existsSync(target)) {
    if (existsSync(opts.legacyDbPath) && path.resolve(opts.legacyDbPath) !== path.resolve(target)) {
      log("Domus memories DB already at service path; leaving legacy bare sqlite in place", {
        target,
        legacyDbPath: opts.legacyDbPath,
      });
    }
    return target;
  }

  if (!existsSync(opts.legacyDbPath)) {
    return target;
  }

  mkdirSync(path.dirname(target), { recursive: true });
  renameSync(opts.legacyDbPath, target);
  for (const side of sidecarPaths(opts.legacyDbPath)) {
    if (existsSync(side)) {
      renameSync(side, target + side.slice(opts.legacyDbPath.length));
    }
  }
  log("Migrated bare Domus memories sqlite into memories-service layout", {
    from: opts.legacyDbPath,
    to: target,
  });
  return target;
}
