import { type Config, connect } from "@tursodatabase/serverless";
import { type Client, createClient } from "@tursodatabase/serverless/compat";

export type TursoCredentials = {
  url: string;
  authToken?: string;
  remoteEncryptionKey?: string;
};

/** Minimal connection surface used by registry Turso adapters (avoids tight SDK typing). */
export type RegistryTursoConnection = {
  execute: (
    sql: string,
    args?: unknown[],
  ) => Promise<{ rows?: readonly Record<string, unknown>[] }>;
  exec: (sql: string) => Promise<void>;
  // SDK shapes vary; adapters call these when present.
  transaction: (fn: (...args: never[]) => unknown) => unknown;
  close: () => Promise<void>;
};

export type TursoClients = {
  config: Config;
  read: RegistryTursoConnection;
  write: RegistryTursoConnection;
  batch: Client;
};

export type CreateTursoClientsOptions = TursoCredentials & {
  read?: RegistryTursoConnection;
  write?: RegistryTursoConnection;
  batch?: Client;
};

/** Build read/write connections and a compat batch client (injectable for tests). */
export function createTursoClients(options: CreateTursoClientsOptions): TursoClients {
  const config: Config = {
    url: options.url,
    authToken: options.authToken,
    remoteEncryptionKey: options.remoteEncryptionKey,
  };
  return {
    config,
    read: options.read ?? (connect(config) as unknown as RegistryTursoConnection),
    write: options.write ?? (connect(config) as unknown as RegistryTursoConnection),
    batch: options.batch ?? createClient(config),
  };
}

export type SqlRow = Record<string, unknown>;

export function normalizeRows<T extends SqlRow>(result: { rows?: readonly SqlRow[] }): T[] {
  if (!result.rows) return [];
  return result.rows.map((row) => {
    const out: SqlRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (/^\d+$/.test(key)) continue;
      out[key] = value;
    }
    return out as T;
  });
}

export async function queryAll<T extends SqlRow>(
  conn: RegistryTursoConnection,
  sql: string,
  args: unknown[] = [],
): Promise<T[]> {
  const result = await conn.execute(sql, args);
  return normalizeRows<T>(result);
}

export async function queryOne<T extends SqlRow>(
  conn: RegistryTursoConnection,
  sql: string,
  args: unknown[] = [],
): Promise<T | undefined> {
  const rows = await queryAll<T>(conn, sql, args);
  return rows[0];
}

export async function execSql(
  conn: RegistryTursoConnection,
  sql: string,
  args: unknown[] = [],
): Promise<void> {
  await conn.execute(sql, args);
}

export async function execMultiple(conn: RegistryTursoConnection, sql: string): Promise<void> {
  await conn.exec(sql);
}
