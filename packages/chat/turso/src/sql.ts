import { connect } from "@tursodatabase/serverless";

export type PreparedStatement = {
  run(args?: unknown[]): Promise<unknown>;
  all<T = unknown>(args?: unknown[]): Promise<T[]>;
  get<T = unknown>(args?: unknown[]): Promise<T | null | undefined>;
};

export type SqlDatabase = {
  prepare(sql: string): Promise<PreparedStatement> | PreparedStatement;
  exec?(sql: string): Promise<unknown> | unknown;
};

export type TursoConfig = {
  url: string;
  authToken: string;
};

export function createTursoDatabase(config: TursoConfig): SqlDatabase {
  return connect({ url: config.url, authToken: config.authToken }) as unknown as SqlDatabase;
}

async function prepare(db: SqlDatabase, sql: string): Promise<PreparedStatement> {
  return await Promise.resolve(db.prepare(sql));
}

export async function run(db: SqlDatabase, sql: string, args: unknown[] = []): Promise<void> {
  const stmt = await prepare(db, sql);
  await stmt.run(args);
}

export async function all<T>(db: SqlDatabase, sql: string, args: unknown[] = []): Promise<T[]> {
  const stmt = await prepare(db, sql);
  return await stmt.all<T>(args);
}

export async function get<T>(
  db: SqlDatabase,
  sql: string,
  args: unknown[] = [],
): Promise<T | null> {
  const stmt = await prepare(db, sql);
  return (await stmt.get<T>(args)) ?? null;
}

export async function exec(db: SqlDatabase, sql: string): Promise<void> {
  if (db.exec !== undefined) {
    await Promise.resolve(db.exec(sql));
    return;
  }
  for (const statement of sql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)) {
    await run(db, statement);
  }
}

export async function transaction<T>(db: SqlDatabase, fn: () => Promise<T>): Promise<T> {
  await run(db, "BEGIN IMMEDIATE");
  try {
    const result = await fn();
    await run(db, "COMMIT");
    return result;
  } catch (error) {
    try {
      await run(db, "ROLLBACK");
    } catch {
      /* ignore rollback failure */
    }
    throw error;
  }
}
