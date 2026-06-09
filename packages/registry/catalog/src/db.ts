import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { EnvKeyProvider } from "@khoralabs/colonnade-crypto";
import { openEncryptedDatabaseSync, SqliteCryptoError } from "@khoralabs/sqlite-crypto";

let db: Database | undefined;

export function resetRegistryCatalogDb(): void {
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

function registrySqlCipherKeyFromEnv(): string {
  const name = EnvKeyProvider.REGISTRY_SQLCIPHER_ENV;
  const key = process.env[name]?.trim();
  if (key === undefined || key.length === 0) {
    throw new SqliteCryptoError(`${name} is required`);
  }
  if (key.length < 16) {
    throw new SqliteCryptoError(`${name} must be at least 16 characters`);
  }
  return key;
}

export function getRegistryCatalogDb(): Database {
  if (db !== undefined) return db;
  const path = registryDatabasePath();
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  db = openEncryptedDatabaseSync(path, { create: true }, registrySqlCipherKeyFromEnv());
  db.run("PRAGMA foreign_keys = ON;");
  return db;
}
