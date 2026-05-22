import type { Database } from "bun:sqlite";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";
import {
  createMemoriesPersistence,
  ensureCustomSqliteForExtensions,
  openMemoriesDatabase,
} from "@khoralabs/memories-sqlite";

export type OpenAtriumMemoriesDbResult = {
  db: Database;
  persistence: MemoriesPersistence;
};

export function openAtriumMemoriesDb(dbPath: string): OpenAtriumMemoriesDbResult {
  ensureCustomSqliteForExtensions();
  const db = openMemoriesDatabase(dbPath);
  const persistence = createMemoriesPersistence(db);
  return { db, persistence };
}
