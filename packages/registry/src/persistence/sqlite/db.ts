import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { EnvKeyProvider } from "@khoralabs/colonnade/crypto";
import { initRegistryDomainSchema } from "@khoralabs/khora-registry/persistence";
import { openEncryptedDatabaseSync, SqliteCryptoError } from "@khoralabs/sqlite-crypto";
import { createRegistrySqliteBundle, type RegistrySqliteBundle } from "./sqlite-database";

let bundle: RegistrySqliteBundle | undefined;

export function resetRegistrySqliteDatabase(): void {
  bundle?.db.close();
  bundle = undefined;
}

export function registryDatabasePath(): string {
  const configured = process.env.REGISTRY_DATABASE_PATH?.trim();
  const raw =
    configured !== undefined && configured.length > 0
      ? configured
      : resolve(import.meta.dir, "../../catalog/data/registry.sqlite");
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

function openRawRegistrySqliteDatabase(): Database {
  const path = registryDatabasePath();
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = openEncryptedDatabaseSync(path, { create: true }, registrySqlCipherKeyFromEnv());
  db.run("PRAGMA foreign_keys = ON;");
  return db;
}

export function getRegistrySqliteBundle(): RegistrySqliteBundle {
  if (bundle !== undefined) return bundle;
  bundle = createRegistrySqliteBundle(openRawRegistrySqliteDatabase());
  return bundle;
}

/** Raw bun:sqlite handle (shared file with domain tables; app uses for Better Auth on sqlite). */
export function getRegistrySqliteDatabase(): Database {
  return getRegistrySqliteBundle().db;
}

export async function openRegistrySqliteDatabase(): Promise<RegistrySqliteBundle> {
  const next = createRegistrySqliteBundle(openRawRegistrySqliteDatabase());
  await initRegistryDomainSchema(next.registry);
  bundle = next;
  return next;
}

export function createRegistrySqliteDatabaseFromMemory(): RegistrySqliteBundle {
  const db = openEncryptedDatabaseSync(":memory:", { create: true }, registrySqlCipherKeyFromEnv());
  db.run("PRAGMA foreign_keys = ON;");
  return createRegistrySqliteBundle(db);
}
