import { PERCOLATOR_SCHEMA_SQL } from "../core/schema";

export { PERCOLATOR_SCHEMA_SQL };

export function ensurePercolatorSchema(db: { run: (sql: string) => void }): void {
  db.run(PERCOLATOR_SCHEMA_SQL);
  for (const table of ["percolator_filter_queries", "percolator_semantic_queries"]) {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN owner_ordinal INTEGER NOT NULL DEFAULT 0`);
    } catch (error) {
      if (!String(error).includes("duplicate column name")) throw error;
    }
  }
  db.run(`
    DROP INDEX IF EXISTS idx_pfilter_active;
    CREATE INDEX idx_pfilter_active
      ON percolator_filter_queries(active, expires_at_ms, owner_ordinal, id);
    DROP INDEX IF EXISTS idx_psemantic_active;
    CREATE INDEX idx_psemantic_active
      ON percolator_semantic_queries(active, expires_at_ms, owner_ordinal, id);
  `);
}
