import { PERCOLATOR_SCHEMA_SQL } from "../core/schema";
import type { TursoClients } from "./client";
import { execMultiple } from "./client";

export { PERCOLATOR_SCHEMA_SQL };

export async function ensurePercolatorSchemaTurso(db: TursoClients): Promise<void> {
  await execMultiple(db.write, PERCOLATOR_SCHEMA_SQL);
}
