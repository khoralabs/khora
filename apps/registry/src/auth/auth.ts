import type { Database } from "bun:sqlite";
import { getRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import {
  createRegistryAuth,
  type RegistryAuthDatabase,
  type RegistryAuthOptions,
} from "./auth-config";
import type { RegistryAuthKysely } from "./auth-database-schema";

let authInstance: ReturnType<typeof createRegistryAuth> | undefined;
let authOptions: RegistryAuthOptions = {};

export function reloadRegistryAuth(opts: RegistryAuthOptions = {}): void {
  authOptions = { ...authOptions, ...opts };
  authInstance = undefined;
}

export function getRegistryAuth(): ReturnType<typeof createRegistryAuth> {
  authInstance ??= createRegistryAuth(authOptions);
  return authInstance;
}

type AuthInstance = ReturnType<typeof createRegistryAuth>;

/** Lazy proxy so env is read after the app preloads `.env`. */
export const registryAuth: AuthInstance = new Proxy({} as AuthInstance, {
  get(_target, prop) {
    const instance = getRegistryAuth() as Record<string | symbol, unknown>;
    const value = instance[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});

function isSqliteAuthDatabase(db: RegistryAuthDatabase): db is Database {
  return "prepare" in db && typeof db.prepare === "function";
}

function resolveAuthDatabase(): RegistryAuthDatabase {
  if (authOptions.database !== undefined) return authOptions.database;
  return getRegistrySqliteDatabase();
}

/** Delete all Better Auth sessions for a user id (no admin plugin / no caller session). */
export async function revokeBetterAuthSessionsForUser(userId: string): Promise<void> {
  const id = userId.trim();
  if (id.length === 0) return;
  const db = resolveAuthDatabase();
  if (isSqliteAuthDatabase(db)) {
    db.prepare(`DELETE FROM session WHERE userId = ?`).run(id);
    return;
  }
  const kysely = db as RegistryAuthKysely;
  await kysely.deleteFrom("session").where("userId", "=", id).execute();
}
