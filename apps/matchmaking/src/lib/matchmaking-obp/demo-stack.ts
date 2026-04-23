import { Database } from "bun:sqlite";
import { ObpClient, type ObpPersistence } from "@cfd/obp-core";
import { createObpSqlitePersistence, initObpSchema, openObpDatabase } from "@cfd/obp-sqlite";

export const DEMO_CLOCK_MS = 1_704_067_200_000;

export type DemoStack = {
  db: Database;
  client: ObpClient;
  persistence: ObpPersistence;
  now: () => number;
};

export type CreateDemoStackOptions = {
  now?: () => number;
  /** When set, opens file-backed SQLite at this path (parent dirs must exist). */
  databasePath?: string;
};

/** OBP client + SQLite persistence for one matchmaking run (`:memory:` or file-backed). */
export function createDemoStack(options?: CreateDemoStackOptions): DemoStack {
  const now = options?.now ?? (() => DEMO_CLOCK_MS);
  const db =
    options?.databasePath !== undefined
      ? openObpDatabase(options.databasePath)
      : (() => {
          const d = new Database(":memory:");
          initObpSchema(d);
          return d;
        })();
  const persistence = createObpSqlitePersistence(db, { now });
  const client = new ObpClient(persistence, { now });
  return { db, client, persistence, now };
}
