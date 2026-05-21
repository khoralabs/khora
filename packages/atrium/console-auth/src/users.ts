import { isBootstrapAdminEmail, normalizeEmail } from "./allowlist.ts";
import { getAuthDatabase } from "./db.ts";

type UserRow = { role: string | null };

export function findUserRoleByEmail(email: string): string | null {
  try {
    const db = getAuthDatabase();
    const row = db
      .prepare(`SELECT role FROM user WHERE email = ? LIMIT 1`)
      .get(normalizeEmail(email)) as UserRow | undefined;
    return row?.role ?? null;
  } catch {
    // Schema not migrated yet (no user table / role column).
    return null;
  }
}

export async function canSignInAsAdmin(email: string): Promise<boolean> {
  if (isBootstrapAdminEmail(email)) return true;
  const role = findUserRoleByEmail(email);
  return role === "admin";
}

export async function canReceiveAdminOtp(email: string): Promise<boolean> {
  return canSignInAsAdmin(email);
}
