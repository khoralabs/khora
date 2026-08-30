import type { AdminTokenAuth } from "@khoralabs/khora-auth";
import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";
import type { RegistryIdentityPort } from "./ports/identity";

export type RegistryHostDeps = {
  db: RegistryDatabase;
  identity: RegistryIdentityPort;
  adminTokenAuth: AdminTokenAuth | null;
  publicUrl: () => string;
  resolveTrustedOrigins: () => string[] | Promise<string[]>;
};
