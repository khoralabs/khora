import { getRegistryDatabase } from "./db";
import { initRegistrySchema, isAuthSchemaReady } from "./schema";

export function isRegistryAuthSchemaReady(): boolean {
  try {
    return isAuthSchemaReady(getRegistryDatabase());
  } catch {
    return false;
  }
}

/** Apply pending domain + Better Auth migrations when auth tables are missing. */
export async function ensureRegistrySchema(): Promise<void> {
  if (isRegistryAuthSchemaReady()) return;
  console.log("[users-auth] Applying registry schema migrations …");
  await initRegistrySchema(getRegistryDatabase());
}
