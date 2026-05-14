import type { Database } from "bun:sqlite";
import { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { createObpV2SqliteStrategy, SqliteObpPersistenceStrategy } from "./strategy.ts";

export { initObpV2Schema, openObpV2Database } from "./connection.ts";
export { OBP_V2_SCHEMA_SQL } from "./schema.ts";
export { createObpV2SqliteStrategy, SqliteObpPersistenceStrategy };

export function createObpV2SqlitePersistenceClient(
  db: Database,
  opts?: { ledgerSeq?: () => number },
): ObpPersistenceClient {
  return new ObpPersistenceClient(createObpV2SqliteStrategy(db, opts));
}
