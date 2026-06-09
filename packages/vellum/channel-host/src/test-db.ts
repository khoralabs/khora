import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { FrameRelayStoreStrategy } from "@khoralabs/obp-frame-relay";
import { createSqliteFrameRelayStoreStrategy } from "@khoralabs/obp-frame-relay-sqlite";
import { openEncryptedDatabaseSync } from "@khoralabs/sqlite-crypto";

import { ensureChannelRegistrySchema } from "./registry-schema";

export const DEV_SQLCIPHER_KEY = "vellum-dev-sqlcipher-key";

export function relayDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.VELLUM_RELAY_DB_PATH?.trim();
  const raw =
    configured !== undefined && configured.length > 0
      ? configured
      : resolve(import.meta.dir, "../data/channel-relay.sqlite");
  if (raw === ":memory:") return raw;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

export function applyRelayDbPragmas(db: Database): void {
  db.run(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size = -64000;
    PRAGMA temp_store = MEMORY;
  `);
}

export function openRelayDatabase(path?: string, key?: string): Database {
  const dbPath = path ?? relayDatabasePath();
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = openEncryptedDatabaseSync(dbPath, { create: true }, key ?? DEV_SQLCIPHER_KEY);
  applyRelayDbPragmas(db);
  ensureChannelRegistrySchema(db);
  return db;
}

export function createFrameStore(db: Database): FrameRelayStoreStrategy {
  return createSqliteFrameRelayStoreStrategy(db);
}
