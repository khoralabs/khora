import type { RegistryDatabase } from "./port";
import { REGISTRY_DOMAIN_SCHEMA_SQL } from "./schema-sql";

export async function initRegistryDomainSchema(db: RegistryDatabase): Promise<void> {
  await db.exec("PRAGMA foreign_keys = ON;");
  await db.execMultiple(REGISTRY_DOMAIN_SCHEMA_SQL);
}
