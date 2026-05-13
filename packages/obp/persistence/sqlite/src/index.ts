import type { Database } from "bun:sqlite";
import { OBPPersistenceClient } from "@khoralabs/obp-persistence-client";
import { createObpSqlitePersistence } from "./persistence";

export { initObpSchema, openObpDatabase } from "./connection";
export { createObpSqlitePersistence, ObpSqlitePersistence } from "./persistence";
export { OBP_SCHEMA_SQL } from "./schema";
export {
  type CompletedDeal,
  FakeObpPersistence,
  type FakeObpPersistenceSnapshot,
  type GraphSnapshot,
  ObpError,
  type ObpErrorCode,
  OBPPersistenceClient,
  type OBPPersistenceClientOptions,
  type ObpPersistence,
  resolveCompletedDeal,
} from "@khoralabs/obp-persistence-client";

/** SQLite-backed {@link OBPPersistenceClient} using {@link createObpSqlitePersistence}. */
export function createObpSqlitePersistenceClient(
  db: Database,
  options: { ledgerSeq: () => number },
): OBPPersistenceClient {
  return new OBPPersistenceClient({
    persistence: createObpSqlitePersistence(db, options),
    ledgerSeq: options.ledgerSeq,
  });
}
