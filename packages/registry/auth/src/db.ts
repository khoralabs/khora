export {
  getRegistrySqliteBundle,
  getRegistrySqliteDatabase,
  getRegistrySqliteDatabase as getRegistryDatabase,
  registryDatabasePath,
  resetRegistrySqliteDatabase as resetRegistryDatabase,
} from "@khoralabs/registry-sqlite";

import type { RegistryDatabase } from "@khoralabs/registry-persistence";
import { getRegistrySqliteBundle } from "@khoralabs/registry-sqlite";

export function getRegistryDomainDatabase(): RegistryDatabase {
  return getRegistrySqliteBundle().registry;
}
