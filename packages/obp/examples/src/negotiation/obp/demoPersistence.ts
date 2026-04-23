import { Database } from "bun:sqlite";
import { ObpClient, type ObpPersistence } from "@cfd/obp-core";
import { createObpSqlitePersistence, initObpSchema } from "@cfd/obp-sqlite";

export const DEMO_CLOCK_MS = 1_704_067_200_000;

export type DemoStack = {
  db: Database;
  client: ObpClient;
  persistence: ObpPersistence;
  now: () => number;
};

export function createDemoStack(options?: { now?: () => number }): DemoStack {
  const now = options?.now ?? (() => DEMO_CLOCK_MS);
  const db = new Database(":memory:");
  initObpSchema(db);
  const persistence = createObpSqlitePersistence(db, { now });
  const client = new ObpClient(persistence, { now });
  return { db, client, persistence, now };
}
