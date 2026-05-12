import type { Database } from "bun:sqlite";
import type { AgentDid } from "@khoralabs/swarm-host";
import { migrateAtriumHostDb } from "./migrate-atrium-host-db.ts";

export type RegistrationsSubjectsRepo = {
  upsertRegistration(did: AgentDid, profileId: string): void;
  registrationExists(did: AgentDid): boolean;
  profileIdForDid(did: AgentDid): string | undefined;
  didForProfileId(profileId: string): AgentDid | undefined;
  subscribeSubject(did: AgentDid, subject: string): void;
  unsubscribeSubject(did: AgentDid, subject: string): void;
  listSubjectsForDid(did: AgentDid): string[];
  subscriberDidsForSubject(subject: string, excludeDid?: AgentDid): AgentDid[];
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
    upsertRegistration(did, profileId) {
      upsertRegistrationStmt.run(did, profileId, Date.now());
    },
    registrationExists(did) {
      const row = selectRegistrationExists.get(did);
      return row !== undefined && row !== null;
    },
    profileIdForDid(did) {
      return selectProfileIdForDid.get(did)?.profile_id;
    },
    didForProfileId(profileId) {
      const row = selectDidForProfileId.get(profileId);
      return row?.did as AgentDid | undefined;
    },
    subscribeSubject(did, subject) {
      subscribeStmt.run(did, subject, Date.now());
    },
    unsubscribeSubject(did, subject) {
      unsubscribeStmt.run(did, subject);
    },
    listSubjectsForDid(did) {
      const rows = selectSubjectsForDid.all(did);
      return rows.map((r) => r.subject);
    },
    subscriberDidsForSubject(subject, excludeDid) {
      const rows = excludeDid
        ? selectSubscriberDidsExclude.all(subject, excludeDid)
        : selectSubscriberDidsAll.all(subject);
      return rows.map((r) => r.did as AgentDid);
    },
  };
}
