import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";

import { openMemoriesDatabase } from "@khoralabs/memories-sqlite";

import { logger } from "../logger.js";
import { getMemoriesSqlCipherKey, resolveMemoriesDir } from "./config.js";
import {
  buildPrincipalSegmentMigrationMap,
  currentMemoriesDbBasename,
  legacyMemoriesDbBasename,
  memoriesDbUsesLegacyFilename,
} from "./encode-principal-id-legacy.js";
import { migrateLegacyMemoriesDatabase } from "./migrate-legacy-memories-db.js";

function listMemoriesPrincipalIds(db: Database): string[] {
  const orgIds = db
    .query<{ id: string }, []>(`SELECT id FROM orgs`)
    .all()
    .map((row) => row.id);
  const userIds = db
    .query<{ id: string }, []>(`SELECT id FROM users`)
    .all()
    .map((row) => row.id);
  return [...new Set([...orgIds, ...userIds])];
}

function renameMemoriesDatabaseFiles(oldPath: string, newPath: string): void {
  renameSync(oldPath, newPath);
  for (const suffix of ["-wal", "-shm"]) {
    const oldSidecar = `${oldPath}${suffix}`;
    const newSidecar = `${newPath}${suffix}`;
    if (existsSync(oldSidecar)) renameSync(oldSidecar, newSidecar);
  }
}

function migrateLegacyMemoriesDbFile(args: {
  oldPath: string;
  newPath: string;
  principalId: string;
  segmentMap: ReadonlyMap<string, string>;
}): void {
  const { oldPath, newPath, principalId, segmentMap } = args;
  const db = openMemoriesDatabase(oldPath, { sqlCipherKey: getMemoriesSqlCipherKey() });
  try {
    const changed = migrateLegacyMemoriesDatabase(db, segmentMap);
    if (changed) {
      logger.info({ principalId, oldPath, newPath }, "migrated legacy memories namespace paths");
    }
  } finally {
    db.run("PRAGMA wal_checkpoint(FULL)");
    db.close();
  }

  if (oldPath === newPath) return;

  if (existsSync(newPath)) {
    logger.warn(
      { principalId, oldPath, newPath },
      "legacy memories db migrated in place but target filename already exists; keeping new filename copy",
    );
    return;
  }

  renameMemoriesDatabaseFiles(oldPath, newPath);
  logger.info({ principalId, newPath }, "renamed memories database to short principal filename");
}

/** Migrate on-disk memories databases from legacy principal filenames and scope paths. */
export function migrateMemoriesStore(db: Database): void {
  const memoriesDir = resolveMemoriesDir();
  mkdirSync(memoriesDir, { recursive: true });

  const principalIds = listMemoriesPrincipalIds(db);
  const segmentMap = buildPrincipalSegmentMigrationMap(principalIds);
  if (segmentMap.size === 0) return;

  const knownLegacyBasenames = new Set(
    principalIds.map((principalId) => legacyMemoriesDbBasename(principalId)),
  );

  for (const principalId of principalIds) {
    const legacyBasename = legacyMemoriesDbBasename(principalId);
    const nextBasename = currentMemoriesDbBasename(principalId);
    if (legacyBasename === nextBasename) continue;

    const oldPath = path.join(memoriesDir, `${legacyBasename}.db`);
    const newPath = path.join(memoriesDir, `${nextBasename}.db`);
    if (!existsSync(oldPath)) continue;

    migrateLegacyMemoriesDbFile({ oldPath, newPath, principalId, segmentMap });
  }

  for (const entry of readdirSync(memoriesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".db")) continue;
    const basename = entry.name.slice(0, -".db".length);
    if (!memoriesDbUsesLegacyFilename(basename)) continue;
    if (knownLegacyBasenames.has(basename)) continue;
    logger.warn(
      { file: entry.name },
      "legacy memories db filename does not match any known org/user id; migrate manually or delete",
    );
  }
}
