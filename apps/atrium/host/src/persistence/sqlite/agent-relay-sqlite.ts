import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import {
  createAgentRelayEntitySqlitePersistence,
  createAgentRelayPostSqlitePersistence,
} from "./entity-sqlite.ts";
import { createFrameChannelHubPersistenceSqlite } from "./frame-channel-hub-persistence-sqlite.ts";
import { migrateAtriumHostDb } from "./migrate-atrium-host-db.ts";
import { createRegistrationsSubjectsRepo } from "./registrations-subjects-sqlite.ts";

/** SQLite-backed {@link AgentRelayPersistence} (frame-channel hub persistence + `host_entities` logical slices). */
export function createAgentRelaySqlitePersistence(db: Database): AgentRelayPersistence {
  migrateAtriumHostDb(db);
  const registrationsSubjects = createRegistrationsSubjectsRepo(db);
  return {
    frameChannelHubPersistence: createFrameChannelHubPersistenceSqlite(db),
    profiles: createAgentRelayEntitySqlitePersistence(db, "profile"),
    posts: createAgentRelayPostSqlitePersistence(db),
    topics: createAgentRelayEntitySqlitePersistence(db, "topic"),
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
