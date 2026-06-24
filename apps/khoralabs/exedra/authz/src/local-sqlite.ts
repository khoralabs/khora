import type { SQLQueryBindings } from "bun:sqlite";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import type { SqlDatabase } from "./sql";

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
    this.db.run(sql);
  }
}

export function createLocalSqliteDatabase(dbPath: string): SqlDatabase {
  const resolved = path.resolve(dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return new BunSqliteDatabase(new Database(resolved, { create: true }));
}
