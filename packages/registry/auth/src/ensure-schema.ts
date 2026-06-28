import type { RegistryAuthDatabase } from "./auth-config";
import { initRegistrySchema } from "./schema";

export type RegistryBootstrapStore = {
  registry: import("@khoralabs/registry-persistence").RegistryDatabase;
  authDatabase: RegistryAuthDatabase;
};

/** Ensure domain + Better Auth tables exist (greenfield bootstrap on every startup). */
export async function ensureRegistrySchema(store?: RegistryBootstrapStore): Promise<void> {
  if (store !== undefined) {
    await initRegistrySchema(store.registry, store.authDatabase);
    return;
  }
  const { getRegistrySqliteBundle } = await import("@khoralabs/registry-sqlite");
  const { db, registry } = getRegistrySqliteBundle();
  await initRegistrySchema(registry, db);
}
