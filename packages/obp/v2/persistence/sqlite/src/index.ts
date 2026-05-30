import type { Database } from "bun:sqlite";
import { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { createObpV2SqliteStrategy, SqliteObpPersistenceStrategy } from "./strategy";

export { initObpV2Schema, openObpV2Database } from "./connection";
export { OBP_V2_SCHEMA_SQL } from "./schema";
export { createObpV2SqliteStrategy, SqliteObpPersistenceStrategy };

export function createObpV2SqlitePersistenceClient(db: Database): ObpPersistenceClient {
  return new ObpPersistenceClient(createObpV2SqliteStrategy(db));
}
