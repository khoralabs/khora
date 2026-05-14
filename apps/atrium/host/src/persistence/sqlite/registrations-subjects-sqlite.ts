import type { Database } from "bun:sqlite";
import type { PrincipalId } from "@khoralabs/swarm-host";
import { migrateAtriumHostDb } from "./migrate-atrium-host-db.ts";

export type RegistrationsSubjectsRepo = {
  upsertRegistration(principalId: PrincipalId, profileId: string): void;
  registrationExists(principalId: PrincipalId): boolean;
  profileIdForPrincipal(principalId: PrincipalId): string | undefined;
  principalForProfileId(profileId: string): PrincipalId | undefined;
  subscribeSubject(principalId: PrincipalId, subject: string): void;
  unsubscribeSubject(principalId: PrincipalId, subject: string): void;
  listSubjectsForPrincipal(principalId: PrincipalId): string[];
  subscriberPrincipalsForSubject(subject: string, excludePrincipalId?: PrincipalId): PrincipalId[];
};

export function createRegistrationsSubjectsRepo(db: Database): RegistrationsSubjectsRepo {
  migrateAtriumHostDb(db);

  const upsertRegistrationStmt = db.prepare(
    `INSERT INTO host_registrations (did, profile_id, registered_at) VALUES (?, ?, ?)
     ON CONFLICT(did) DO UPDATE SET profile_id = excluded.profile_id`,
  );
  const selectRegistrationExists = db.query<{ one: number }, [string]>(
    `SELECT 1 AS one FROM host_registrations WHERE did = ? LIMIT 1`,
  );
  const selectProfileIdForDid = db.query<{ profile_id: string }, [string]>(
    `SELECT profile_id FROM host_registrations WHERE did = ? LIMIT 1`,
  );
  const selectDidForProfileId = db.query<{ did: string }, [string]>(
    `SELECT did FROM host_registrations WHERE profile_id = ? LIMIT 1`,
  );
  const subscribeStmt = db.prepare(
    `INSERT INTO agent_subscriptions (did, subject, created_at) VALUES (?, ?, ?)
     ON CONFLICT(did, subject) DO NOTHING`,
  );
  const unsubscribeStmt = db.prepare(
    `DELETE FROM agent_subscriptions WHERE did = ? AND subject = ?`,
  );
  const selectSubjectsForDid = db.query<{ subject: string }, [string]>(
    `SELECT subject FROM agent_subscriptions WHERE did = ? ORDER BY created_at ASC`,
  );
  const selectSubscriberDidsAll = db.query<{ did: string }, [string]>(
    `SELECT did FROM agent_subscriptions WHERE subject = ?`,
  );
  const selectSubscriberDidsExclude = db.query<{ did: string }, [string, string]>(
    `SELECT did FROM agent_subscriptions WHERE subject = ? AND did != ?`,
  );

  return {
    upsertRegistration(principalId, profileId) {
      upsertRegistrationStmt.run(principalId, profileId, Date.now());
    },
    registrationExists(principalId) {
      const row = selectRegistrationExists.get(principalId);
      return row !== undefined && row !== null;
    },
    profileIdForPrincipal(principalId) {
      return selectProfileIdForDid.get(principalId)?.profile_id;
    },
    principalForProfileId(profileId) {
      const row = selectDidForProfileId.get(profileId);
      return row?.did as PrincipalId | undefined;
    },
    subscribeSubject(principalId, subject) {
      subscribeStmt.run(principalId, subject, Date.now());
    },
    unsubscribeSubject(principalId, subject) {
      unsubscribeStmt.run(principalId, subject);
    },
    listSubjectsForPrincipal(principalId) {
      const rows = selectSubjectsForDid.all(principalId);
      return rows.map((r) => r.subject);
    },
    subscriberPrincipalsForSubject(subject, excludePrincipalId) {
      const rows = excludePrincipalId
        ? selectSubscriberDidsExclude.all(subject, excludePrincipalId)
        : selectSubscriberDidsAll.all(subject);
      return rows.map((r) => r.did as PrincipalId);
    },
  };
}
