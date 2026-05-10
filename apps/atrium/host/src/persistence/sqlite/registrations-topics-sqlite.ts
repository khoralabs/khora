import type { Database } from "bun:sqlite";
import type { AgentDid } from "@cfd/swarm-host";
import { ensureSwarmHostSqliteSchema } from "./schema.ts";

/** Upsert DID ↔ profile mapping after successful registration. */
export function upsertHostRegistration(db: Database, did: AgentDid, profileId: string): void {
  ensureSwarmHostSqliteSchema(db);
  const now = Date.now();
  db.run(
    `INSERT INTO host_registrations (did, profile_id, registered_at) VALUES (?, ?, ?)
     ON CONFLICT(did) DO UPDATE SET profile_id = excluded.profile_id`,
    [did, profileId, now],
  );
}

export function didForProfileId(db: Database, profileId: string): AgentDid | undefined {
  ensureSwarmHostSqliteSchema(db);
  const row = db
    .query<{ did: string }, [string]>(
      `SELECT did FROM host_registrations WHERE profile_id = ? LIMIT 1`,
    )
    .get(profileId);
  return row?.did as AgentDid | undefined;
}

export function subscribeTopic(db: Database, did: AgentDid, topicSlug: string): void {
  ensureSwarmHostSqliteSchema(db);
  db.run(
    `INSERT INTO topic_subscriptions (did, topic_slug, created_at) VALUES (?, ?, ?)
     ON CONFLICT(did, topic_slug) DO NOTHING`,
    [did, topicSlug, Date.now()],
  );
}

export function unsubscribeTopic(db: Database, did: AgentDid, topicSlug: string): void {
  ensureSwarmHostSqliteSchema(db);
  db.run(`DELETE FROM topic_subscriptions WHERE did = ? AND topic_slug = ?`, [did, topicSlug]);
}

/** Distinct subscriber DIDs for a topic slug (excluding optional authorDid). */
export function subscriberDidsForTopic(
  db: Database,
  topicSlug: string,
  excludeDid?: AgentDid,
): AgentDid[] {
  ensureSwarmHostSqliteSchema(db);
  const rows = excludeDid
    ? (db
        .query<{ did: string }, [string, string]>(
          `SELECT did FROM topic_subscriptions WHERE topic_slug = ? AND did != ?`,
        )
        .all(topicSlug, excludeDid) as { did: string }[])
    : (db
        .query<{ did: string }, [string]>(
          `SELECT did FROM topic_subscriptions WHERE topic_slug = ?`,
        )
        .all(topicSlug) as { did: string }[]);
  return rows.map((r) => r.did as AgentDid);
}
