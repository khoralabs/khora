import type { Database } from "bun:sqlite";
import type { SwarmHostPersistence } from "@khoralabs/swarm-host";
import {
  createSwarmHostEntitySqlitePersistence,
  createSwarmHostPostSqlitePersistence,
} from "./entity-sqlite.ts";
import { migrateAtriumHostDb } from "./migrate-atrium-host-db.ts";
import { createObpRelaySqlitePersistence } from "./obp-relay-sqlite.ts";
import { createRegistrationsSubjectsRepo } from "./registrations-subjects-sqlite.ts";

/** SQLite-backed {@link SwarmHostPersistence} (OBP relay + `host_entities` logical slices). */
export function createSwarmHostSqlitePersistence(db: Database): SwarmHostPersistence {
  migrateAtriumHostDb(db);
  const registrationsSubjects = createRegistrationsSubjectsRepo(db);
  return {
    obpRelay: createObpRelaySqlitePersistence(db),
    profiles: createSwarmHostEntitySqlitePersistence(db, "profile"),
    posts: createSwarmHostPostSqlitePersistence(db),
    topics: createSwarmHostEntitySqlitePersistence(db, "topic"),
    agentRegistrations: {
      exists: (did) => registrationsSubjects.registrationExists(did),
      upsert: (did, profileId) => registrationsSubjects.upsertRegistration(did, profileId),
      profileIdForDid: (did) => registrationsSubjects.profileIdForDid(did),
      didForProfileId: (profileId) => registrationsSubjects.didForProfileId(profileId),
    },
    agentSubjectSubscriptions: {
      listSubjectsForDid: (did) => registrationsSubjects.listSubjectsForDid(did),
      subscriberDidsForSubject: (subject, excludeDid) =>
        registrationsSubjects.subscriberDidsForSubject(subject, excludeDid),
      subscribe: (did, subject) => registrationsSubjects.subscribeSubject(did, subject),
      unsubscribe: (did, subject) => registrationsSubjects.unsubscribeSubject(did, subject),
    },
  };
}
