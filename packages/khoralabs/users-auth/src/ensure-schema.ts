import { getRegistryDatabase } from "./db";
import { initRegistrySchema } from "./schema";

/** Ensure domain + Better Auth tables exist (greenfield bootstrap on every startup). */
export async function ensureRegistrySchema(): Promise<void> {
  await initRegistrySchema(getRegistryDatabase());
}
