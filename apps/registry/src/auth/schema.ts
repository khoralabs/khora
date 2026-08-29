import type { Database } from "bun:sqlite";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { getMigrations } from "better-auth/db/migration";
import { createRegistryAuth, type RegistryAuthDatabase } from "./auth-config";

async function ensureAuthSchema(authDb: RegistryAuthDatabase): Promise<void> {
  const auth = createRegistryAuth({ database: authDb });
  const { toBeAdded, toBeCreated, runMigrations } = await getMigrations(auth.options);
  if (toBeAdded.length === 0 && toBeCreated.length === 0) {
    return;
  }
  await runMigrations();
}

export async function initBetterAuthSchema(authDb: RegistryAuthDatabase): Promise<void> {
  if ("run" in authDb && typeof authDb.run === "function") {
    (authDb as Database).run("PRAGMA foreign_keys = ON;");
  }
  await ensureAuthSchema(authDb);
}

export async function initRegistryAppSchema(
  registry: RegistryDatabase,
  authDb: RegistryAuthDatabase,
): Promise<void> {
  await initRegistryDomainSchema(registry);
  await initBetterAuthSchema(authDb);
}
