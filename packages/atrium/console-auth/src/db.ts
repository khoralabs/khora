import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

let db: Database | undefined;

export function resetAuthDatabase(): void {
  db?.close();
  db = undefined;
}

export function authDatabasePath(): string {
  const configured = process.env.ATRIUM_AUTH_DATABASE_PATH?.trim();
  const raw =
    configured !== undefined && configured.length > 0
      ? configured
      : resolve(import.meta.dir, "../data/auth.sqlite");
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

export function getAuthDatabase(): Database {
  if (db !== undefined) return db;
  const path = authDatabasePath();
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}
