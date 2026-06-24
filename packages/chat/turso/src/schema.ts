import type { SqlDatabase } from "./sql.ts";
import { exec, run } from "./sql.ts";

export const CHAT_SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_channels (
  id TEXT PRIMARY KEY,
  metadata TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  root_type TEXT NOT NULL,
  root_id TEXT NOT NULL,
  root_version_id TEXT,
  default_head_id TEXT,
  metadata TEXT,
  created_at_ms INTEGER NOT NULL,
  archived_at_ms INTEGER
);

CREATE TABLE IF NOT EXISTS chat_posts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  post_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'complete',
  stream_message TEXT,
  stream_mentions TEXT,
  stream_model TEXT,
  stream_usage TEXT,
  stream_author_scope_type TEXT,
  stream_author_scope_id TEXT,
  stream_revision INTEGER NOT NULL DEFAULT 0,
  completed_version_id TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER,
  deleted_at_ms INTEGER,
  UNIQUE(thread_id, post_index)
);

CREATE TABLE IF NOT EXISTS chat_post_stream_events (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  revision INTEGER NOT NULL,
  message TEXT,
  delta TEXT,
  mentions TEXT,
  model TEXT,
  usage TEXT,
  idempotency_key TEXT UNIQUE,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_post_versions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  parent_version_id TEXT,
  previous_post_version_id TEXT,
  author_scope_type TEXT NOT NULL,
  author_scope_id TEXT NOT NULL,
  message TEXT NOT NULL,
  mentions TEXT,
  model TEXT,
  usage TEXT,
  content_hash TEXT NOT NULL,
  lineage_hash TEXT NOT NULL,
  signature TEXT,
  idempotency_key TEXT UNIQUE,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_thread_heads (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  name TEXT NOT NULL,
  head_post_version_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_acl_events (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_scope_type TEXT NOT NULL,
  actor_scope_id TEXT NOT NULL,
  subject_scope_type TEXT,
  subject_scope_id TEXT,
  role TEXT,
  previous_acl_event_id TEXT,
  content_hash TEXT NOT NULL,
  signature TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_channel_members (
  channel_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (channel_id, scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS chat_thread_participants (
  thread_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (thread_id, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_root ON chat_threads(root_type, root_id);
CREATE INDEX IF NOT EXISTS idx_chat_post_versions_thread ON chat_post_versions(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_post_versions_post ON chat_post_versions(post_id);
CREATE INDEX IF NOT EXISTS idx_chat_posts_thread ON chat_posts(thread_id, post_index);
CREATE INDEX IF NOT EXISTS idx_chat_post_stream_events_post ON chat_post_stream_events(post_id, revision);
`;

export async function ensureChatSchema(db: SqlDatabase): Promise<void> {
  await exec(db, CHAT_SCHEMA);
  for (const statement of [
    "ALTER TABLE chat_posts ADD COLUMN stream_model TEXT",
    "ALTER TABLE chat_posts ADD COLUMN stream_usage TEXT",
    "ALTER TABLE chat_post_stream_events ADD COLUMN model TEXT",
    "ALTER TABLE chat_post_stream_events ADD COLUMN usage TEXT",
    "ALTER TABLE chat_post_versions ADD COLUMN model TEXT",
    "ALTER TABLE chat_post_versions ADD COLUMN usage TEXT",
  ]) {
    try {
      await run(db, statement);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
        throw error;
      }
    }
  }
}
