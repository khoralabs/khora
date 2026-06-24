import type { Database } from "bun:sqlite";

export function ensureExedraSchema(db: Database): void {
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      registry_user_id TEXT NOT NULL UNIQUE,
      email TEXT,
      full_name TEXT,
      job_function TEXT,
      avatar_s3_key TEXT,
      identity_encrypted BLOB,
      terms_accepted_at_ms INTEGER,
      network_opted_in_at_ms INTEGER,
      session_consent_accepted_at_ms INTEGER,
      marketing_opted_in_at_ms INTEGER,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      avatar_s3_key TEXT,
      identity_encrypted BLOB,
      network_opted_in_at_ms INTEGER,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      avatar_s3_key TEXT,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id),
      topic TEXT NOT NULL,
      deadline_ms INTEGER,
      status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'synthesis', 'alignment', 'closed')),
      kind TEXT NOT NULL DEFAULT 'standard',
      link_access TEXT NOT NULL DEFAULT 'restricted',
      link_grant_role TEXT NOT NULL DEFAULT 'participant',
      interview_summary TEXT,
      next_session_options BLOB,
      interview_completed_at_ms INTEGER,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      token_hash TEXT PRIMARY KEY NOT NULL,
      created_by_user_id TEXT REFERENCES users(id),
      created_at_ms INTEGER NOT NULL,
      consumed_at_ms INTEGER,
      consumed_by_user_id TEXT REFERENCES users(id),
      effects BLOB NOT NULL,
      reusable INTEGER NOT NULL DEFAULT 0,
      revoked_at_ms INTEGER,
      link_plaintext TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_invites_created_by
      ON invites(created_by_user_id);

    CREATE TABLE IF NOT EXISTS team_account_onboarding (
      team_id TEXT NOT NULL REFERENCES teams(id),
      account_id TEXT NOT NULL REFERENCES users(id),
      onboarding_session_id TEXT REFERENCES sessions(id),
      onboarding_interview_complete INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY (team_id, account_id)
    );

    CREATE TABLE IF NOT EXISTS session_participants (
      session_id TEXT NOT NULL REFERENCES sessions(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      personal_memory_consent_at_ms INTEGER,
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY (session_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_session_participants_user
      ON session_participants(user_id);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      batch_id TEXT NOT NULL,
      target_namespace TEXT NOT NULL,
      grant_resource_type TEXT NOT NULL,
      grant_resource_id TEXT NOT NULL,
      org_id TEXT,
      team_id TEXT,
      uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      s3_key TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'accepted',
      error_message TEXT,
      task_run_id TEXT,
      processed_at_ms INTEGER,
      created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_grant
      ON documents(grant_resource_type, grant_resource_id, created_at_ms DESC);

    CREATE INDEX IF NOT EXISTS idx_documents_batch
      ON documents(batch_id, created_at_ms DESC);

    CREATE INDEX IF NOT EXISTS idx_documents_namespace
      ON documents(target_namespace, created_at_ms DESC);

    CREATE TABLE IF NOT EXISTS belief_feedback (
      thread_id TEXT NOT NULL,
      belief_id TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      feedback TEXT NOT NULL CHECK(feedback IN ('confirmed', 'corrected')),
      correction TEXT,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (thread_id, belief_id)
    );
  `);
}
