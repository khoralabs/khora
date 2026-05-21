import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

let db: Database | undefined;

export function resetUsersDatabase(): void {
  db?.close();
  db = undefined;
}

export function registryDatabasePath(): string {
  const configured = process.env.REGISTRY_DATABASE_PATH?.trim();
  const raw =
    configured !== undefined && configured.length > 0
      ? configured
      : resolve(import.meta.dir, "../data/registry.sqlite");
  if (raw === ":memory:") return raw;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

export function getUsersDatabase(): Database {
  if (db !== undefined) return db;
  const path = registryDatabasePath();
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  db = new Database(path, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}
