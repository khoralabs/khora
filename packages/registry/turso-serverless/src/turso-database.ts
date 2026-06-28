import type { RegistryDatabase } from "@khoralabs/registry-persistence";
import {
  execMultiple as execMultipleSql,
  execSql,
  queryAll,
  queryOne,
  type TursoClients,
} from "./client";

export function createRegistryTursoDatabase(clients: TursoClients): RegistryDatabase {
  const read = clients.read;
  const write = clients.write;

  return {
    queryAll<T extends Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T[]> {
      return queryAll<T>(read, sql, args);
    },

    queryOne<T extends Record<string, unknown>>(
      sql: string,
      args: unknown[] = [],
    ): Promise<T | undefined> {
      return queryOne<T>(read, sql, args);
    },

    exec(sql: string, args: unknown[] = []): Promise<void> {
      return execSql(write, sql, args);
    },

    execMultiple(sql: string): Promise<void> {
      return execMultipleSql(write, sql);
    },

    async transaction<T>(fn: (tx: RegistryDatabase) => Promise<T>): Promise<T> {
      let result: T | undefined;
      await write.transaction(async () => {
        result = await fn(createRegistryTursoDatabase({ ...clients, read: write, write }));
      });
      return result as T;
    },

    async close(): Promise<void> {
      await clients.read.close();
      await clients.write.close();
    },
  };
}
