import { getRegistryDatabase } from "./db";
import { getRegistrySession } from "./session";

const SESSION_COOKIE_NAMES = ["__Secure-better-auth.session_token", "better-auth.session_token"];

/** Raw bearer token from the `session` table (not suitable for CLI Cookie replay). */
export async function getRegistrySessionToken(req: Request): Promise<string | null> {
  const session = await getRegistrySession(req);
  if (session === null) return null;
  const db = getRegistryDatabase();
  const row = db
    .prepare(`SELECT token FROM session WHERE id = ? LIMIT 1`)
    .get(session.session.id) as { token: string } | null;
  return row?.token ?? null;
}

/**
 * Signed session cookie pair from the incoming request (`name=value`).
 * Better Auth stores a signed value in the cookie; replaying the raw DB token fails getSession.
 */
export function getRegistrySessionCookieHeader(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader === null || cookieHeader.length === 0) return null;

  const cookies = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    cookies.set(name, value);
  }

  for (const name of SESSION_COOKIE_NAMES) {
    const value = cookies.get(name);
    if (value !== undefined && value.length > 0) {
      return `${name}=${value}`;
    }
  }
  return null;
}
