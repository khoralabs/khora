import type { Database } from "bun:sqlite";
import type { SwarmHostPersistence } from "@khoralabs/swarm-host";
import {
  createSwarmHostEntitySqlitePersistence,
  createSwarmHostPostSqlitePersistence,
} from "./entity-sqlite.ts";
import { createObpRelaySqlitePersistence } from "./obp-relay-sqlite.ts";
import { createRegistrationsTopicsRepo } from "./registrations-topics-sqlite.ts";
import { ensureSwarmHostSqliteSchema } from "./schema.ts";

/** SQLite-backed {@link SwarmHostPersistence} (OBP relay + `host_entities` logical slices). */
export function createSwarmHostSqlitePersistence(db: Database): SwarmHostPersistence {
  ensureSwarmHostSqliteSchema(db);
  const registrationsTopics = createRegistrationsTopicsRepo(db);
  return {
    obpRelay: createObpRelaySqlitePersistence(db),
    profiles: createSwarmHostEntitySqlitePersistence(db, "profile"),
    posts: createSwarmHostPostSqlitePersistence(db),
    topics: createSwarmHostEntitySqlitePersistence(db, "topic"),
    agentRegistrations: {
      exists: (did) => registrationsTopics.registrationExists(did),
      upsert: (did, profileId) => registrationsTopics.upsertRegistration(did, profileId),
      profileIdForDid: (did) => registrationsTopics.profileIdForDid(did),
      didForProfileId: (profileId) => registrationsTopics.didForProfileId(profileId),
    },
    agentTopicSubscriptions: {
      listSlugsForDid: (did) => registrationsTopics.listTopicSlugsForDid(did),
      subscriberDidsForTopic: (slug, excludeDid) =>
        registrationsTopics.subscriberDidsForTopic(slug, excludeDid),
      subscribe: (did, slug) => registrationsTopics.subscribeTopic(did, slug),
      unsubscribe: (did, slug) => registrationsTopics.unsubscribeTopic(did, slug),
    },
  };
}
