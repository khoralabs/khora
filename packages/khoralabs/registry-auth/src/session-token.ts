import { getRegistryDatabase } from "./db";
import { getRegistrySession } from "./session";

/** Better Auth session bearer token for CLI handoff (from `session` table). */
export async function getRegistrySessionToken(req: Request): Promise<string | null> {
  const session = await getRegistrySession(req);
  if (session === null) return null;
  const db = getRegistryDatabase();
  const row = db
    .prepare(`SELECT token FROM session WHERE id = ? LIMIT 1`)
    .get(session.session.id) as { token: string } | null;
  return row?.token ?? null;
}
