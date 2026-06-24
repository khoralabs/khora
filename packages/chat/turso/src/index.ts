export {
  closeLocalSqliteDatabase,
  createLocalSqliteDatabase,
  createMemorySqliteDatabase,
} from "./local-sqlite.ts";
export { createTursoChatPersistence, TursoChatPersistence } from "./persistence.ts";
export { ensureChatSchema } from "./schema.ts";
export { createTursoDatabase, type SqlDatabase, type TursoConfig } from "./sql.ts";

import { createMemorySqliteDatabase } from "./local-sqlite.ts";
import { createTursoChatPersistence } from "./persistence.ts";
import { ensureChatSchema } from "./schema.ts";

export async function createTestChatDatabase(): Promise<{
  db: import("./sql.ts").SqlDatabase;
  persistence: ReturnType<typeof createTursoChatPersistence>;
}> {
  const db = createMemorySqliteDatabase();
  await ensureChatSchema(db);
  return { db, persistence: createTursoChatPersistence(db) };
}
