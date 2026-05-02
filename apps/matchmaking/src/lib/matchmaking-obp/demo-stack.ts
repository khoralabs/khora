import { Database } from "bun:sqlite";
import { ObpClient, type ObpPersistence } from "@cfd/obp-core";
import { createObpSqlitePersistence, initObpSchema, openObpDatabase } from "@cfd/obp-sqlite";

/** Default fixed ledger sequence for demos (same value on every read, like the old wall-clock demo). */
export const DEMO_LEDGER_SEQ = 1_704_067_200_000;

export type DemoStack = {
  db: Database;
  client: ObpClient;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  /** Wall-clock ms for JSONL logging only; OBP validity uses {@link ledgerSeq}. */
  demoLogNowMs: () => number;
};

export type CreateDemoStackOptions = {
  ledgerSeq?: () => number;
  /** Log line timestamps when using {@link createLoggingObpPersistence}; defaults to {@link Date.now}. */
  demoLogNowMs?: () => number;
  /** When set, opens file-backed SQLite at this path (parent dirs must exist). */
  databasePath?: string;
};

/** OBP client + SQLite persistence for one matchmaking run (`:memory:` or file-backed). */
export function createDemoStack(options?: CreateDemoStackOptions): DemoStack {
  const ledgerSeq = options?.ledgerSeq ?? (() => DEMO_LEDGER_SEQ);
  const demoLogNowMs = options?.demoLogNowMs ?? (() => Date.now());
  const db =
    options?.databasePath !== undefined
      ? openObpDatabase(options.databasePath)
      : (() => {
          const d = new Database(":memory:");
          initObpSchema(d);
          return d;
        })();
  const persistence = createObpSqlitePersistence(db, { ledgerSeq });
  const client = new ObpClient(persistence, { ledgerSeq });
  return { db, client, persistence, ledgerSeq, demoLogNowMs };
}
