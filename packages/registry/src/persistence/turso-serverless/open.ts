import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { createTursoClients, type TursoClients } from "./client";
import { createRegistryTursoDatabase } from "./turso-database";

export type RegistryTursoBundle = {
  clients: TursoClients;
  registry: RegistryDatabase;
  close(): Promise<void>;
};

export type OpenRegistryTursoOptions = {
  url: string;
  authToken?: string;
  remoteEncryptionKey?: string;
  clients?: TursoClients;
};

export async function openRegistryTursoDatabase(
  opts: OpenRegistryTursoOptions,
): Promise<RegistryTursoBundle> {
  const clients =
    opts.clients ??
    createTursoClients({
      url: opts.url,
      authToken: opts.authToken,
      remoteEncryptionKey: opts.remoteEncryptionKey,
    });
  const registry = createRegistryTursoDatabase(clients);
  await initRegistryDomainSchema(registry);
  return {
    clients,
    registry,
    async close() {
      await registry.close();
    },
  };
}

export function registryTursoCredentialsFromEnv(): {
  url: string;
  authToken: string;
} {
  const url =
    process.env.REGISTRY_TURSO_URL?.trim() ?? process.env.TURSO_DATABASE_URL?.trim() ?? "";
  const authToken =
    process.env.REGISTRY_TURSO_AUTH_TOKEN?.trim() ?? process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
  if (url.length === 0 || authToken.length === 0) {
    throw new Error(
      "Turso registry requires REGISTRY_TURSO_URL (or TURSO_DATABASE_URL) and REGISTRY_TURSO_AUTH_TOKEN (or TURSO_AUTH_TOKEN)",
    );
  }
  return { url, authToken };
}
