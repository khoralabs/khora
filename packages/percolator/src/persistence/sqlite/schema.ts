import { PERCOLATOR_SCHEMA_SQL } from "../core/schema";

export { PERCOLATOR_SCHEMA_SQL };

export function ensurePercolatorSchema(db: { run: (sql: string) => void }): void {
  db.run(PERCOLATOR_SCHEMA_SQL);
}
