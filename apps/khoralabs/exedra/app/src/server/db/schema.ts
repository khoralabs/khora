import type { Database } from "bun:sqlite";

import { OrgPermission, TeamPermission } from "../../shared/authz/permissions";
import { grantTeamScopeOrgPermission, grantTeamScopePermission } from "../authz/grant-templates";
import { getOrgIdForTeam, hasGrant } from "../authz/grants";
import { ResourceType, teamScope } from "../authz/policy";
import { ensureAuthzSchema } from "../authz/schema";

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

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('interview', 'alignment')),
      session_id TEXT NOT NULL REFERENCES sessions(id),
      user_id TEXT REFERENCES users(id),
      created_at_ms INTEGER NOT NULL,
      closed_at_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_threads_session_user
      ON threads(session_id, user_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      thread_id TEXT NOT NULL REFERENCES threads(id),
      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
      author_did TEXT NOT NULL,
      parts BLOB NOT NULL,
      metadata BLOB,
      message_index INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_thread
      ON messages(thread_id, message_index);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'done', 'failed')),
      payload BLOB,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      error TEXT
    );

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
      thread_id TEXT NOT NULL REFERENCES threads(id),
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
  migrateSessionsAddInterviewCompletion(db);
  migrateInvitesAddReusableColumns(db);
  migrateOrgsAddIdentityEncrypted(db);
  migrateOrgsDropDidColumn(db);
  migrateUsersAddTermsColumns(db);
  migrateOrgsAddNetworkOptIn(db);
  migrateSessionDocumentsAddProcessingColumns(db);
  migrateUnifiedDocumentsTable(db);
  migrateDocumentsAddGrantResourceColumns(db);
  migrateDocumentsDropSessionIdColumn(db);
  ensureAuthzSchema(db);
  migrateDefaultSessionCreatePermissions(db);
  migrateSessionParticipantsPersonalMemoryConsent(db);
}

function migrateUnifiedDocumentsTable(db: Database): void {
  const sessionDocumentsExists = db
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_documents' LIMIT 1`,
    )
    .get();
  if (sessionDocumentsExists === null) return;

  const directDocumentsExists = db
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'direct_documents' LIMIT 1`,
    )
    .get();

  db.run(`
    CREATE TABLE IF NOT EXISTS documents_new (
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
    )
  `);

  db.run(`
    INSERT INTO documents_new (
      id, batch_id, target_namespace, grant_resource_type, grant_resource_id,
      org_id, team_id,
      uploaded_by_user_id, file_name, mime_type, byte_size, content_hash,
      s3_key, memory_key, summary, status, error_message, task_run_id,
      processed_at_ms, created_at_ms
    )
    SELECT
      sd.id,
      COALESCE(sd.turn_id, sd.id),
      COALESCE(u.registry_user_id, sd.uploaded_by_user_id),
      'session',
      sd.session_id,
      NULL,
      NULL,
      sd.uploaded_by_user_id,
      sd.file_name,
      sd.mime_type,
      sd.byte_size,
      sd.content_hash,
      sd.s3_key,
      sd.memory_key,
      COALESCE(sd.summary, ''),
      COALESCE(sd.status, 'accepted'),
      sd.error_message,
      sd.task_run_id,
      sd.processed_at_ms,
      sd.created_at_ms
    FROM session_documents sd
    LEFT JOIN users u ON u.id = sd.uploaded_by_user_id
  `);

  if (directDocumentsExists !== null) {
    db.run(`
      INSERT INTO documents_new (
        id, batch_id, target_namespace, grant_resource_type, grant_resource_id,
        org_id, team_id,
        uploaded_by_user_id, file_name, mime_type, byte_size, content_hash,
        s3_key, memory_key, summary, status, error_message, task_run_id,
        processed_at_ms, created_at_ms
      )
      SELECT
        dd.id,
        COALESCE(dd.turn_id, dd.id),
        dd.target_namespace,
        CASE
          WHEN dd.team_id IS NOT NULL THEN 'team'
          WHEN dd.org_id IS NOT NULL THEN 'org'
          ELSE 'account'
        END,
        COALESCE(dd.team_id, dd.org_id, dd.uploaded_by_user_id),
        dd.org_id,
        dd.team_id,
        dd.uploaded_by_user_id,
        dd.file_name,
        dd.mime_type,
        dd.byte_size,
        dd.content_hash,
        dd.s3_key,
        dd.memory_key,
        COALESCE(dd.summary, ''),
        COALESCE(dd.status, 'accepted'),
        dd.error_message,
        dd.task_run_id,
        dd.processed_at_ms,
        dd.created_at_ms
      FROM direct_documents dd
    `);
    db.run(`DROP TABLE direct_documents`);
  }

  db.run(`DROP TABLE session_documents`);
  db.run(`DROP TABLE IF EXISTS documents`);
  db.run(`ALTER TABLE documents_new RENAME TO documents`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_documents_grant ON documents(grant_resource_type, grant_resource_id, created_at_ms DESC)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_documents_batch ON documents(batch_id, created_at_ms DESC)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_documents_namespace ON documents(target_namespace, created_at_ms DESC)`,
  );
}

function migrateDocumentsAddGrantResourceColumns(db: Database): void {
  const documentsExists = db
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents' LIMIT 1`,
    )
    .get();
  if (documentsExists === null) return;

  const columns = db.query<{ name: string }, []>("PRAGMA table_info(documents)").all();
  const hasSessionId = columns.some((column) => column.name === "session_id");
  if (!columns.some((column) => column.name === "grant_resource_type")) {
    db.run(`ALTER TABLE documents ADD COLUMN grant_resource_type TEXT`);
    db.run(`ALTER TABLE documents ADD COLUMN grant_resource_id TEXT`);
  }

  if (hasSessionId) {
    db.run(`
      UPDATE documents
      SET grant_resource_type = 'session', grant_resource_id = session_id
      WHERE session_id IS NOT NULL
        AND (grant_resource_type IS NULL OR grant_resource_id IS NULL)
    `);
    db.run(`
      UPDATE documents
      SET grant_resource_type = 'team', grant_resource_id = team_id
      WHERE session_id IS NULL
        AND team_id IS NOT NULL
        AND (grant_resource_type IS NULL OR grant_resource_id IS NULL)
    `);
    db.run(`
      UPDATE documents
      SET grant_resource_type = 'org', grant_resource_id = org_id
      WHERE session_id IS NULL
        AND team_id IS NULL
        AND org_id IS NOT NULL
        AND (grant_resource_type IS NULL OR grant_resource_id IS NULL)
    `);
  } else {
    db.run(`
      UPDATE documents
      SET grant_resource_type = 'team', grant_resource_id = team_id
      WHERE team_id IS NOT NULL
        AND (grant_resource_type IS NULL OR grant_resource_id IS NULL)
    `);
    db.run(`
      UPDATE documents
      SET grant_resource_type = 'org', grant_resource_id = org_id
      WHERE team_id IS NULL
        AND org_id IS NOT NULL
        AND (grant_resource_type IS NULL OR grant_resource_id IS NULL)
    `);
  }
  db.run(`
    UPDATE documents
    SET grant_resource_type = 'account', grant_resource_id = uploaded_by_user_id
    WHERE grant_resource_type IS NULL OR grant_resource_id IS NULL
  `);
}

function migrateDocumentsDropSessionIdColumn(db: Database): void {
  const documentsExists = db
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents' LIMIT 1`,
    )
    .get();
  if (documentsExists === null) return;

  const columns = db.query<{ name: string }, []>("PRAGMA table_info(documents)").all();
  if (!columns.some((column) => column.name === "session_id")) return;

  db.run(`DROP INDEX IF EXISTS idx_documents_session`);
  db.run(`ALTER TABLE documents DROP COLUMN session_id`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_documents_grant ON documents(grant_resource_type, grant_resource_id, created_at_ms DESC)`,
  );
}

function migrateSessionDocumentsAddProcessingColumns(db: Database): void {
  const sessionDocumentsExists = db
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_documents' LIMIT 1`,
    )
    .get();
  if (sessionDocumentsExists === null) return;

  const columns = db.query<{ name: string }, []>("PRAGMA table_info(session_documents)").all();
  if (!columns.some((column) => column.name === "status")) {
    db.run(`ALTER TABLE session_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'`);
    db.run(`UPDATE session_documents SET status = 'ready' WHERE summary != ''`);
    db.run(`UPDATE session_documents SET status = 'accepted' WHERE summary = ''`);
  }
  if (!columns.some((column) => column.name === "error_message")) {
    db.run(`ALTER TABLE session_documents ADD COLUMN error_message TEXT`);
  }
  if (!columns.some((column) => column.name === "task_run_id")) {
    db.run(`ALTER TABLE session_documents ADD COLUMN task_run_id TEXT`);
  }
  if (!columns.some((column) => column.name === "turn_id")) {
    db.run(`ALTER TABLE session_documents ADD COLUMN turn_id TEXT`);
  }
  if (!columns.some((column) => column.name === "processed_at_ms")) {
    db.run(`ALTER TABLE session_documents ADD COLUMN processed_at_ms INTEGER`);
  }
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

function migrateDefaultSessionCreatePermissions(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS exedra_schema_patches (
      patch_id TEXT PRIMARY KEY NOT NULL,
      applied_at_ms INTEGER NOT NULL
    )
  `);
  const applied = db
    .query<{ patch_id: string }, [string]>(
      `SELECT patch_id FROM exedra_schema_patches WHERE patch_id = ? LIMIT 1`,
    )
    .get("session_create_default_grants");
  if (applied !== null) return;

  const teams = db.query<{ id: string }, []>(`SELECT id FROM teams`).all();
  for (const { id: teamId } of teams) {
    const orgId = getOrgIdForTeam(db, teamId);
    if (orgId === null) continue;
    if (
      !hasGrant(
        db,
        teamScope(teamId),
        { type: ResourceType.Team, id: teamId },
        TeamPermission.SessionCreate,
      )
    ) {
      grantTeamScopePermission(db, teamId, TeamPermission.SessionCreate);
    }
    if (
      !hasGrant(
        db,
        teamScope(teamId),
        { type: ResourceType.Organization, id: orgId },
        OrgPermission.SessionCreate,
      )
    ) {
      grantTeamScopeOrgPermission(db, teamId, orgId, OrgPermission.SessionCreate);
    }
  }

  db.run(`INSERT INTO exedra_schema_patches (patch_id, applied_at_ms) VALUES (?, ?)`, [
    "session_create_default_grants",
    Date.now(),
  ]);
}
