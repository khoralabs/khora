import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";

function asBindings(args: unknown[]): SQLQueryBindings[] {
  return args as SQLQueryBindings[];
}

function runSql(db: Database, sql: string, args: unknown[] = []): void {
  if (args.length === 0) {
    db.run(sql);
    return;
  }
  db.query(sql).run(...asBindings(args));
}

export function createRegistrySqliteDatabase(db: Database): RegistryDatabase {
  return {
    async queryAll<T extends Record<string, unknown>>(
      sql: string,
      args: unknown[] = [],
    ): Promise<T[]> {
      if (args.length === 0) {
        return db.query(sql).all() as T[];
      }
      return db.query(sql).all(...asBindings(args)) as T[];
    },

    async queryOne<T extends Record<string, unknown>>(
      sql: string,
      args: unknown[] = [],
    ): Promise<T | undefined> {
      if (args.length === 0) {
        return (db.query(sql).get() as T | null) ?? undefined;
      }
      return (db.query(sql).get(...asBindings(args)) as T | null) ?? undefined;
    },

    async exec(sql: string, args: unknown[] = []): Promise<void> {
      runSql(db, sql, args);
    },

    async execMultiple(sql: string): Promise<void> {
      for (const stmt of sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)) {
        db.run(stmt);
      }
    },

    async transaction<T>(fn: (tx: RegistryDatabase) => Promise<T>): Promise<T> {
      db.run("BEGIN IMMEDIATE");
      try {
        const result = await fn(createRegistrySqliteDatabase(db));
        db.run("COMMIT");
        return result;
      } catch (e) {
        db.run("ROLLBACK");
        throw e;
      }
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}

/** Raw bun:sqlite handle for Better Auth (sync adapter). */
export type RegistrySqliteBundle = {
  db: Database;
  registry: RegistryDatabase;
};

export function createRegistrySqliteBundle(db: Database): RegistrySqliteBundle {
  return { db, registry: createRegistrySqliteDatabase(db) };
}
