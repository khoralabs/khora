import { mkdirSync } from "node:fs";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";
import {
  createMemoriesPersistence,
  ensureCustomSqliteForExtensions,
  openMemoriesDatabase,
} from "@khoralabs/memories-sqlite";

import { getMemoriesSqlCipherKey, resolveMemoriesDir } from "./config.js";
import { resolveOrgMemoriesDbPath, resolveUserMemoriesDbPath } from "./paths.js";

const MAX_CACHED_DBS = 64;

const orgCache = new Map<string, MemoriesPersistence>();
const userCache = new Map<string, MemoriesPersistence>();

let extensionsReady = false;

function ensureMemoriesExtensions(): void {
  if (extensionsReady) return;
  ensureCustomSqliteForExtensions();
  mkdirSync(resolveMemoriesDir(), { recursive: true });
  extensionsReady = true;
}

function openPersistence(dbPath: string): MemoriesPersistence {
  ensureMemoriesExtensions();
  const db = openMemoriesDatabase(dbPath, { sqlCipherKey: getMemoriesSqlCipherKey() });
  return createMemoriesPersistence(db);
}

function evictOldest(cache: Map<string, MemoriesPersistence>): void {
  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) cache.delete(oldestKey);
}

export function openOrgMemories(orgId: string): MemoriesPersistence {
  const cached = orgCache.get(orgId);
  if (cached !== undefined) return cached;
  if (orgCache.size >= MAX_CACHED_DBS) evictOldest(orgCache);
  const persistence = openPersistence(resolveOrgMemoriesDbPath(orgId));
  orgCache.set(orgId, persistence);
  return persistence;
}

export function openUserMemories(userId: string): MemoriesPersistence {
  const cached = userCache.get(userId);
  if (cached !== undefined) return cached;
  if (userCache.size >= MAX_CACHED_DBS) evictOldest(userCache);
  const persistence = openPersistence(resolveUserMemoriesDbPath(userId));
  userCache.set(userId, persistence);
  return persistence;
}

export function resetMemoriesStoreForTests(): void {
  orgCache.clear();
  userCache.clear();
  extensionsReady = false;
}
