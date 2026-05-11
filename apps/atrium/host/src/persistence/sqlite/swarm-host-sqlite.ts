import type { Database } from "bun:sqlite";
import type { SwarmHostPersistence } from "@cfd/swarm-host";
import {
  createSwarmHostEntitySqlitePersistence,
  createSwarmHostPostSqlitePersistence,
} from "./entity-sqlite.ts";
import { createObpRelaySqlitePersistence } from "./obp-relay-sqlite.ts";
import {
  didForProfileId,
  listTopicSlugsForDid,
  profileIdForDid,
  registrationExists,
  subscriberDidsForTopic,
  subscribeTopic,
  unsubscribeTopic,
  upsertHostRegistration,
} from "./registrations-topics-sqlite.ts";
import { ensureSwarmHostSqliteSchema } from "./schema.ts";

/** SQLite-backed {@link SwarmHostPersistence} (OBP relay + `host_entities` logical slices). */
export function createSwarmHostSqlitePersistence(db: Database): SwarmHostPersistence {
  ensureSwarmHostSqliteSchema(db);
  return {
    obpRelay: createObpRelaySqlitePersistence(db),
    profiles: createSwarmHostEntitySqlitePersistence(db, "profile"),
    posts: createSwarmHostPostSqlitePersistence(db),
    topics: createSwarmHostEntitySqlitePersistence(db, "topic"),
    agentRegistrations: {
      exists: (did) => registrationExists(db, did),
      upsert: (did, profileId) => upsertHostRegistration(db, did, profileId),
      profileIdForDid: (did) => profileIdForDid(db, did),
      didForProfileId: (profileId) => didForProfileId(db, profileId),
    },
    agentTopicSubscriptions: {
      listSlugsForDid: (did) => listTopicSlugsForDid(db, did),
      subscriberDidsForTopic: (slug, excludeDid) => subscriberDidsForTopic(db, slug, excludeDid),
      subscribe: (did, slug) => subscribeTopic(db, did, slug),
      unsubscribe: (did, slug) => unsubscribeTopic(db, did, slug),
    },
  };
}
