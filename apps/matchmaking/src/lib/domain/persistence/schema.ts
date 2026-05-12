export const DOMAIN_SCHEMA_V1 = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  subject_id TEXT NOT NULL PRIMARY KEY,
  display_name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT NOT NULL PRIMARY KEY,
  subject_id TEXT NOT NULL,
  invitee_persona_slug TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT NOT NULL PRIMARY KEY,
  invite_id TEXT NOT NULL UNIQUE,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_holds (
  id TEXT NOT NULL PRIMARY KEY,
  subject_id TEXT NOT NULL,
  invite_id TEXT,
  booking_id TEXT,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  time_zone TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reflections (
  id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  decision TEXT,
  agent_feedback TEXT,
  text TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_events (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT,
  occurred_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lexical_lines (
  namespace TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  line_json TEXT NOT NULL,
  PRIMARY KEY (namespace, memory_id, source_key)
);
`;

export const DOMAIN_SCHEMA_RUN_SUMMARIES = `
CREATE TABLE IF NOT EXISTS run_summaries (
  id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  party_slug TEXT NOT NULL,
  counterparty_slug TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  fit_assessment TEXT,
  key_evidence_json TEXT NOT NULL DEFAULT '[]',
  recommended_next_step TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (run_id, party_slug),
  FOREIGN KEY (run_id) REFERENCES invites(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_run_summaries_run_id ON run_summaries(run_id);
CREATE INDEX IF NOT EXISTS idx_run_summaries_party_slug ON run_summaries(party_slug);
`;
