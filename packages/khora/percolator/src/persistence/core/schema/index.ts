export const PERCOLATOR_SCHEMA_SQL = `
DROP TABLE IF EXISTS standing_queries;

CREATE TABLE IF NOT EXISTS percolator_filter_queries (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  search_json TEXT NOT NULL,
  min_score REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_pfilter_owner ON percolator_filter_queries(owner_id);
CREATE INDEX IF NOT EXISTS idx_pfilter_active ON percolator_filter_queries(active, expires_at_ms);

CREATE TABLE IF NOT EXISTS percolator_semantic_queries (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  search_json TEXT NOT NULL,
  vector BLOB,
  min_score REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_psemantic_owner ON percolator_semantic_queries(owner_id);
CREATE INDEX IF NOT EXISTS idx_psemantic_active ON percolator_semantic_queries(active, expires_at_ms);
`.trim();
