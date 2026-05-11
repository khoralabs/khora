import type { Database } from "bun:sqlite";
import type { AgentDid } from "@cfd/swarm-host";
import { ensureSwarmHostSqliteSchema } from "./schema.ts";

export type RegistrationsTopicsRepo = {
  upsertRegistration(did: AgentDid, profileId: string): void;
  registrationExists(did: AgentDid): boolean;
  profileIdForDid(did: AgentDid): string | undefined;
  didForProfileId(profileId: string): AgentDid | undefined;
  subscribeTopic(did: AgentDid, topicSlug: string): void;
  unsubscribeTopic(did: AgentDid, topicSlug: string): void;
  listTopicSlugsForDid(did: AgentDid): string[];
  subscriberDidsForTopic(topicSlug: string, excludeDid?: AgentDid): AgentDid[];
};

export function createRegistrationsTopicsRepo(db: Database): RegistrationsTopicsRepo {
  ensureSwarmHostSqliteSchema(db);

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
  const subscribeTopicStmt = db.prepare(
    `INSERT INTO topic_subscriptions (did, topic_slug, created_at) VALUES (?, ?, ?)
     ON CONFLICT(did, topic_slug) DO NOTHING`,
  );
  const unsubscribeTopicStmt = db.prepare(
    `DELETE FROM topic_subscriptions WHERE did = ? AND topic_slug = ?`,
  );
  const selectTopicSlugsForDid = db.query<{ topic_slug: string }, [string]>(
    `SELECT topic_slug FROM topic_subscriptions WHERE did = ? ORDER BY created_at ASC`,
  );
  const selectSubscriberDidsForTopicAll = db.query<{ did: string }, [string]>(
    `SELECT did FROM topic_subscriptions WHERE topic_slug = ?`,
  );
  const selectSubscriberDidsForTopicExclude = db.query<{ did: string }, [string, string]>(
    `SELECT did FROM topic_subscriptions WHERE topic_slug = ? AND did != ?`,
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
    subscribeTopic(did, topicSlug) {
      subscribeTopicStmt.run(did, topicSlug, Date.now());
    },
    unsubscribeTopic(did, topicSlug) {
      unsubscribeTopicStmt.run(did, topicSlug);
    },
    listTopicSlugsForDid(did) {
      const rows = selectTopicSlugsForDid.all(did);
      return rows.map((r) => r.topic_slug);
    },
    subscriberDidsForTopic(topicSlug, excludeDid) {
      const rows = excludeDid
        ? selectSubscriberDidsForTopicExclude.all(topicSlug, excludeDid)
        : selectSubscriberDidsForTopicAll.all(topicSlug);
      return rows.map((r) => r.did as AgentDid);
    },
  };
}
