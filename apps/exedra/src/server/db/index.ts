import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { ensureExedraSchema } from "./schema";

let dbSingleton: Database | undefined;

export function resolveExedraDataDir(): string {
  const raw = process.env.EXEDRA_DATA_DIR?.trim();
  return raw !== undefined && raw.length > 0 ? raw : "./data";
}

export function resolveExedraDbPath(): string {
  return path.join(resolveExedraDataDir(), "exedra.db");
}

export function getDb(): Database {
  if (dbSingleton !== undefined) return dbSingleton;

  const dataDir = resolveExedraDataDir();
  mkdirSync(dataDir, { recursive: true });

  const db = new Database(resolveExedraDbPath(), { create: true });
  ensureExedraSchema(db);
  dbSingleton = db;
  return db;
}

export function closeDb(): void {
  dbSingleton?.close();
  dbSingleton = undefined;
}
