import type { Database } from "bun:sqlite";
import type { SwarmHostPersistence } from "../types.ts";
import { createSwarmHostEntitySqlitePersistence } from "./entity-sqlite.ts";
import { createObpRelaySqlitePersistence } from "./obp-relay-sqlite.ts";
import { ensureSwarmHostSqliteSchema } from "./schema.ts";

/** SQLite-backed {@link SwarmHostPersistence} (OBP relay + `host_entities` logical slices). */
export function createSwarmHostSqlitePersistence(db: Database): SwarmHostPersistence {
  ensureSwarmHostSqliteSchema(db);
  return {
    obpRelay: createObpRelaySqlitePersistence(db),
    profiles: createSwarmHostEntitySqlitePersistence(db, "profile"),
    posts: createSwarmHostEntitySqlitePersistence(db, "post"),
    topics: createSwarmHostEntitySqlitePersistence(db, "topic"),
  };
}
