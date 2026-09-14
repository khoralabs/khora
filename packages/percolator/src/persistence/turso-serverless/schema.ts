import { PERCOLATOR_SCHEMA_SQL } from "../core/schema";
import type { TursoClients } from "./client";
import { execMultiple, execSql } from "./client";

export { PERCOLATOR_SCHEMA_SQL };

export async function ensurePercolatorSchemaTurso(db: TursoClients): Promise<void> {
  await execMultiple(db.write, PERCOLATOR_SCHEMA_SQL);
  for (const table of ["percolator_filter_queries", "percolator_semantic_queries"]) {
    try {
      await execSql(
        db.write,
        `ALTER TABLE ${table} ADD COLUMN owner_ordinal INTEGER NOT NULL DEFAULT 0`,
      );
    } catch (error) {
      if (!String(error).includes("duplicate column name")) throw error;
    }
  }
  await execMultiple(
    db.write,
    `DROP INDEX IF EXISTS idx_pfilter_active;
     CREATE INDEX idx_pfilter_active
       ON percolator_filter_queries(active, expires_at_ms, owner_ordinal, id);
     DROP INDEX IF EXISTS idx_psemantic_active;
     CREATE INDEX idx_psemantic_active
       ON percolator_semantic_queries(active, expires_at_ms, owner_ordinal, id);`,
  );
}
