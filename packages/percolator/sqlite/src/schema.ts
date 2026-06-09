export const PERCOLATOR_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS standing_queries (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  search_json TEXT NOT NULL,
  min_score REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_standing_queries_owner ON standing_queries(owner_id);
CREATE INDEX IF NOT EXISTS idx_standing_queries_active ON standing_queries(active, expires_at_ms);

CREATE TABLE IF NOT EXISTS standing_query_terms (
  term TEXT NOT NULL,
  query_id TEXT NOT NULL,
  PRIMARY KEY (term, query_id)
);

CREATE INDEX IF NOT EXISTS idx_standing_query_terms_term ON standing_query_terms(term);
`.trim();

export function ensurePercolatorSchema(db: { exec: (sql: string) => void }): void {
  db.run(PERCOLATOR_SCHEMA_SQL);
}
