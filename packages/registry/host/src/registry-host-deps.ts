import type { AdminTokenAuth } from "@khoralabs/admin-token";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";
import type { RegistryIdentityPort } from "./ports/identity";

export type RegistryHostDeps = {
  db: RegistryDatabase;
  identity: RegistryIdentityPort;
  adminTokenAuth: AdminTokenAuth | null;
  publicUrl: () => string;
  resolveTrustedOrigins: () => string[] | Promise<string[]>;
};
