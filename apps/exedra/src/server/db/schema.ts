import type { Database } from "bun:sqlite";

export function ensureExedraSchema(db: Database): void {
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      registry_user_id TEXT NOT NULL UNIQUE,
      identity_encrypted BLOB,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY NOT NULL,
      org_id TEXT NOT NULL REFERENCES orgs(id),
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL REFERENCES teams(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY (team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id),
      display_name TEXT NOT NULL,
      topic TEXT NOT NULL,
      prompt TEXT NOT NULL,
      deadline_ms INTEGER,
      facilitator_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'synthesis', 'alignment', 'closed')),
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_invites (
      token_hash TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      created_at_ms INTEGER NOT NULL,
      consumed_at_ms INTEGER,
      consumed_by_user_id TEXT REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_session_invites_session
      ON session_invites(session_id);

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
  `);
}
