import { initRegistryDomainSchema } from "@khoralabs/khora-registry/persistence";
import type { TursoClients } from "./client";
import { createRegistryTursoDatabase } from "./turso-database";

export async function ensureRegistrySchemaTurso(clients: TursoClients): Promise<void> {
  const registry = createRegistryTursoDatabase(clients);
  await initRegistryDomainSchema(registry);
}
