/** Shared DDL for the host-owned pending embeddings retry queue. */
export const PENDING_EMBEDDINGS_DDL = `
CREATE TABLE IF NOT EXISTS pending_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  source_key TEXT NOT NULL DEFAULT 'body',
  text TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(namespace, memory_key, source_key)
);
`;
