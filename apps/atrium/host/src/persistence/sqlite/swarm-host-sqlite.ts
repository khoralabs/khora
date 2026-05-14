import type { Database } from "bun:sqlite";
import type { SwarmHostPersistence } from "@khoralabs/swarm-host";
import {
  createSwarmHostEntitySqlitePersistence,
  createSwarmHostPostSqlitePersistence,
} from "./entity-sqlite.ts";
import { createFrameChannelHubPersistenceSqlite } from "./frame-channel-hub-persistence-sqlite.ts";
import { migrateAtriumHostDb } from "./migrate-atrium-host-db.ts";
import { createRegistrationsSubjectsRepo } from "./registrations-subjects-sqlite.ts";

/** SQLite-backed {@link SwarmHostPersistence} (frame-channel hub persistence + `host_entities` logical slices). */
export function createSwarmHostSqlitePersistence(db: Database): SwarmHostPersistence {
  migrateAtriumHostDb(db);
  const registrationsSubjects = createRegistrationsSubjectsRepo(db);
  return {
    frameChannelHubPersistence: createFrameChannelHubPersistenceSqlite(db),
    profiles: createSwarmHostEntitySqlitePersistence(db, "profile"),
    posts: createSwarmHostPostSqlitePersistence(db),
    topics: createSwarmHostEntitySqlitePersistence(db, "topic"),
    agentRegistrations: {
      exists: (principalId) => registrationsSubjects.registrationExists(principalId),
      upsert: (principalId, profileId) =>
        registrationsSubjects.upsertRegistration(principalId, profileId),
      profileIdForPrincipal: (principalId) =>
        registrationsSubjects.profileIdForPrincipal(principalId),
      principalForProfileId: (profileId) => registrationsSubjects.principalForProfileId(profileId),
    },
    agentSubjectSubscriptions: {
      listSubjectsForPrincipal: (principalId) =>
        registrationsSubjects.listSubjectsForPrincipal(principalId),
      subscriberPrincipalsForSubject: (subject, excludePrincipalId) =>
        registrationsSubjects.subscriberPrincipalsForSubject(subject, excludePrincipalId),
      subscribe: (principalId, subject) =>
        registrationsSubjects.subscribeSubject(principalId, subject),
      unsubscribe: (principalId, subject) =>
        registrationsSubjects.unsubscribeSubject(principalId, subject),
    },
  };
}
