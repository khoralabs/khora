export type RegistryDatabase = {
  queryAll<T extends Record<string, unknown>>(sql: string, args?: unknown[]): Promise<T[]>;
  queryOne<T extends Record<string, unknown>>(
    sql: string,
    args?: unknown[],
  ): Promise<T | undefined>;
  exec(sql: string, args?: unknown[]): Promise<void>;
  execMultiple(sql: string): Promise<void>;
  transaction<T>(fn: (tx: RegistryDatabase) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};
