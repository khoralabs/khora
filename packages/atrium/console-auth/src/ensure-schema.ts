import { authDatabasePath, getAuthDatabase } from "./db.ts";
import { initAuthSchema } from "./schema.ts";

export function isAuthSchemaReady(): boolean {
  try {
    const db = getAuthDatabase();
    const row = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'verification'`,
      )
      .get() as { name: string } | undefined;
    return row != null;
  } catch {
    return false;
  }
}

/** Apply pending @khoralabs/sqlite-migrate migrations when Better Auth tables are missing. */
export async function ensureAuthSchema(): Promise<void> {
  if (isAuthSchemaReady()) return;
  console.log(
    `[atrium-console-auth] Creating auth tables in ${authDatabasePath()} …`,
  );
  await initAuthSchema(getAuthDatabase());
}
