import type { SQLQueryBindings } from "bun:sqlite";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { CHAT_SCHEMA } from "./schema.ts";
import type { SqlDatabase } from "./sql.ts";

class BunSqliteDatabase implements SqlDatabase {
  constructor(private readonly db: Database) {}

  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    return {
      run: async (args: unknown[] = []) => {
        stmt.run(...(args as SQLQueryBindings[]));
      },
      all: async <T>(args: unknown[] = []) => stmt.all(...(args as SQLQueryBindings[])) as T[],
      get: async <T>(args: unknown[] = []) =>
        (stmt.get(...(args as SQLQueryBindings[])) as T | null) ?? null,
    };
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}

function applyMigrationsSync(db: Database): void {
  for (const statement of [
    "ALTER TABLE chat_posts ADD COLUMN stream_model TEXT",
    "ALTER TABLE chat_posts ADD COLUMN stream_usage TEXT",
    "ALTER TABLE chat_post_stream_events ADD COLUMN model TEXT",
    "ALTER TABLE chat_post_stream_events ADD COLUMN usage TEXT",
    "ALTER TABLE chat_post_versions ADD COLUMN model TEXT",
    "ALTER TABLE chat_post_versions ADD COLUMN usage TEXT",
  ]) {
    try {
      db.run(statement);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
        throw error;
      }
    }
  }
}

export function createLocalSqliteDatabase(dbPath: string): SqlDatabase {
  const resolved = path.resolve(dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved, { create: true });
  db.exec(CHAT_SCHEMA);
  applyMigrationsSync(db);
  return new BunSqliteDatabase(db);
}

export function createMemorySqliteDatabase(): SqlDatabase {
  const db = new Database(":memory:");
  db.exec(CHAT_SCHEMA);
  applyMigrationsSync(db);
  return new BunSqliteDatabase(db);
}

export function closeLocalSqliteDatabase(db: SqlDatabase): void {
  if (db instanceof BunSqliteDatabase) {
    db.close();
  }
}
