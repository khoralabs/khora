import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { Connection } from "@tursodatabase/serverless";
import type { InStatement } from "@tursodatabase/serverless/compat";
import type { TursoClients } from "../client";

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

function connectionFromBunSqlite(db: Database): Connection {
  return {
    execute: async (sql: string, args: unknown[] = []) => {
      const trimmed = sql.trim();
      if (/^SELECT/i.test(trimmed)) {
        const rows =
          args.length === 0
            ? (db.query(trimmed).all() as Record<string, unknown>[])
            : (db.query(trimmed).all(...asBindings(args)) as Record<string, unknown>[]);
        return { rows };
      }
      runSql(db, trimmed, args);
      return { rows: [] };
    },
    exec: async (sql: string) => {
      for (const stmt of sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)) {
        db.run(stmt);
      }
    },
    transaction: (fn) => () => fn(connectionFromBunSqlite(db)),
    close: async () => {},
  } as Connection;
}

/** Test helper: exercise Turso persistence SQL against an in-memory bun:sqlite database. */
export function tursoClientsFromBunSqlite(db: Database): TursoClients {
  const conn = connectionFromBunSqlite(db);
  return {
    config: { url: ":memory:" },
    read: conn,
    write: conn,
    batch: {
      batch: async (statements: InStatement[]) => {
        for (const stmt of statements) {
          if (typeof stmt === "string") {
            db.run(stmt);
          } else {
            runSql(db, stmt.sql, Array.isArray(stmt.args) ? stmt.args : []);
          }
        }
      },
    } as unknown as TursoClients["batch"],
  };
}
