import type { Database } from "bun:sqlite";

export function ensureExedraSchema(db: Database): void {
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      registry_user_id TEXT NOT NULL UNIQUE,
      email TEXT,
      identity_encrypted BLOB,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      identity_encrypted BLOB,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id),
      topic TEXT NOT NULL,
      deadline_ms INTEGER,
      status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'synthesis', 'alignment', 'closed')),
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      token_hash TEXT PRIMARY KEY NOT NULL,
      created_by_user_id TEXT REFERENCES users(id),
      created_at_ms INTEGER NOT NULL,
      consumed_at_ms INTEGER,
      consumed_by_user_id TEXT REFERENCES users(id),
      effects BLOB NOT NULL
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

  migrateUsersAddProfileFields(db);
  migrateUsersAddEmail(db);
  migrateSessionsDropDisplayName(db);
  migrateSessionsDropPrompt(db);
  migrateSessionsAddKind(db);
  migrateSessionsDropFacilitator(db);
  migrateAvatarS3KeyColumns(db);
  migrateSessionsAddLinkAccess(db);
  migrateSessionsAddLinkGrantRole(db);
  migrateSessionsAddInterviewCompletion(db);
  migrateInvitesAddReusableColumns(db);
  migrateOrgsAddIdentityEncrypted(db);
  migrateOrgsDropDidColumn(db);
  migrateUsersAddTermsColumns(db);
  migrateOrgsAddNetworkOptIn(db);
  migrateSessionParticipantsPersonalMemoryConsent(db);
}

function migrateSessionsDropFacilitator(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(sessions)").all();
  if (!columns.some((column) => column.name === "facilitator_id")) return;
  db.run(`ALTER TABLE sessions DROP COLUMN facilitator_id`);
}

function migrateAvatarS3KeyColumns(db: Database): void {
  for (const table of ["users", "orgs", "teams"] as const) {
    const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === "avatar_s3_key")) {
      db.run(`ALTER TABLE ${table} ADD COLUMN avatar_s3_key TEXT`);
    }
  }
}

function migrateUsersAddProfileFields(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(users)").all();
  if (!columns.some((column) => column.name === "full_name")) {
    db.run(`ALTER TABLE users ADD COLUMN full_name TEXT`);
  }
  if (!columns.some((column) => column.name === "job_function")) {
    db.run(`ALTER TABLE users ADD COLUMN job_function TEXT`);
  }
}

function migrateUsersAddEmail(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(users)").all();
  if (!columns.some((column) => column.name === "email")) {
    db.run(`ALTER TABLE users ADD COLUMN email TEXT`);
  }
}

function migrateSessionsDropDisplayName(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(sessions)").all();
  if (!columns.some((column) => column.name === "display_name")) return;

  db.run(
    `UPDATE sessions SET topic = display_name WHERE length(trim(coalesce(display_name, ''))) > 0`,
  );
  db.run(`ALTER TABLE sessions DROP COLUMN display_name`);
}

function migrateSessionsDropPrompt(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(sessions)").all();
  if (!columns.some((column) => column.name === "prompt")) return;
  db.run(`ALTER TABLE sessions DROP COLUMN prompt`);
}

function migrateSessionsAddKind(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(sessions)").all();
  if (columns.some((column) => column.name === "kind")) return;
  db.run(`ALTER TABLE sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard'`);
}

function migrateSessionsAddInterviewCompletion(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(sessions)").all();
  if (!columns.some((column) => column.name === "interview_summary")) {
    db.run(`ALTER TABLE sessions ADD COLUMN interview_summary TEXT`);
  }
  if (!columns.some((column) => column.name === "next_session_options")) {
    db.run(`ALTER TABLE sessions ADD COLUMN next_session_options BLOB`);
  }
  if (!columns.some((column) => column.name === "interview_completed_at_ms")) {
    db.run(`ALTER TABLE sessions ADD COLUMN interview_completed_at_ms INTEGER`);
  }
}

function migrateSessionsAddLinkAccess(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(sessions)").all();
  if (columns.some((column) => column.name === "link_access")) return;
  db.run(`ALTER TABLE sessions ADD COLUMN link_access TEXT NOT NULL DEFAULT 'restricted'`);
}

function migrateSessionsAddLinkGrantRole(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(sessions)").all();
  if (columns.some((column) => column.name === "link_grant_role")) return;
  db.run(`ALTER TABLE sessions ADD COLUMN link_grant_role TEXT NOT NULL DEFAULT 'participant'`);
}

function migrateOrgsAddIdentityEncrypted(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(orgs)").all();
  if (!columns.some((column) => column.name === "identity_encrypted")) {
    db.run(`ALTER TABLE orgs ADD COLUMN identity_encrypted BLOB`);
  }
}

function migrateOrgsDropDidColumn(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(orgs)").all();
  if (columns.some((column) => column.name === "did")) {
    db.run(`ALTER TABLE orgs DROP COLUMN did`);
  }
}

function migrateUsersAddTermsColumns(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(users)").all();
  if (!columns.some((column) => column.name === "terms_accepted_at_ms")) {
    db.run(`ALTER TABLE users ADD COLUMN terms_accepted_at_ms INTEGER`);
  }
  if (!columns.some((column) => column.name === "network_opted_in_at_ms")) {
    db.run(`ALTER TABLE users ADD COLUMN network_opted_in_at_ms INTEGER`);
  }
  if (!columns.some((column) => column.name === "session_consent_accepted_at_ms")) {
    db.run(`ALTER TABLE users ADD COLUMN session_consent_accepted_at_ms INTEGER`);
  }
  if (!columns.some((column) => column.name === "marketing_opted_in_at_ms")) {
    db.run(`ALTER TABLE users ADD COLUMN marketing_opted_in_at_ms INTEGER`);
  }
}

function migrateOrgsAddNetworkOptIn(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(orgs)").all();
  if (!columns.some((column) => column.name === "network_opted_in_at_ms")) {
    db.run(`ALTER TABLE orgs ADD COLUMN network_opted_in_at_ms INTEGER`);
  }
}

function migrateInvitesAddReusableColumns(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(invites)").all();
  if (!columns.some((column) => column.name === "reusable")) {
    db.run(`ALTER TABLE invites ADD COLUMN reusable INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columns.some((column) => column.name === "revoked_at_ms")) {
    db.run(`ALTER TABLE invites ADD COLUMN revoked_at_ms INTEGER`);
  }
  if (!columns.some((column) => column.name === "link_plaintext")) {
    db.run(`ALTER TABLE invites ADD COLUMN link_plaintext TEXT`);
  }
}

function migrateSessionParticipantsPersonalMemoryConsent(db: Database): void {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(session_participants)").all();
  if (!columns.some((column) => column.name === "personal_memory_consent_at_ms")) {
    db.run(`ALTER TABLE session_participants ADD COLUMN personal_memory_consent_at_ms INTEGER`);
  }
}
