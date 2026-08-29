import { createAdminTokenAuthFromEnv } from "@khoralabs/admin-token";
import { assertEncryptionKeys, EnvKeyProvider } from "@khoralabs/colonnade/crypto";
import {
  createBetterAuthRegistryIdentity,
  createBetterAuthRegistryRoutes,
  initRegistrySchema,
  reloadRegistryAuth,
} from "@khoralabs/registry-auth";
import type { RegistryHostContext, RegistryIdentityRoutes } from "@khoralabs/registry-host";
import { createRegistryHost, readRegistryTrustedOrigins } from "@khoralabs/registry-host";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";
import { openRegistrySqliteDatabase } from "@khoralabs/registry-sqlite";
import {
  openRegistryTursoDatabase,
  registryTursoCredentialsFromEnv,
} from "@khoralabs/registry-turso-serverless";

function registryPublicUrl(): string {
  const port = process.env.PORT?.trim() ?? "4000";
  const configured =
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ??
    process.env.BETTER_AUTH_URL?.trim()?.replace(/\/$/, "");
  return configured ?? `http://localhost:${port}`;
}

function isTursoBackend(): boolean {
  return process.env.REGISTRY_BACKEND?.trim().toLowerCase() === "turso";
}

async function openRegistryStore(): Promise<{
  registry: RegistryDatabase;
  authDatabase: import("@khoralabs/registry-auth").RegistryAuthDatabase;
}> {
  if (isTursoBackend()) {
    const bundle = await openRegistryTursoDatabase(registryTursoCredentialsFromEnv());
    return { registry: bundle.registry, authDatabase: bundle.authDatabase };
  }
  const bundle = await openRegistrySqliteDatabase();
  return { registry: bundle.registry, authDatabase: bundle.db };
}

export async function bootstrapRegistryHost(): Promise<{
  host: RegistryHostContext;
  identityRoutes: RegistryIdentityRoutes;
}> {
  if (!isTursoBackend()) {
    await assertEncryptionKeys(new EnvKeyProvider(), "registry");
  }

  const store = await openRegistryStore();
  await initRegistrySchema(store.registry, store.authDatabase);
  reloadRegistryAuth({ database: store.authDatabase, domainDatabase: store.registry });

  const { registry } = store;
  const resolveTrustedOrigins = () => readRegistryTrustedOrigins(registry);
  const publicUrl = registryPublicUrl;

  const identity = createBetterAuthRegistryIdentity({ resolveTrustedOrigins });
  const identityRoutes = createBetterAuthRegistryRoutes({
    db: registry,
    identity,
    publicUrl,
    authMdUrl: process.env.KHORA_AUTH_MD_URL?.trim() || "https://khoralabs.com/auth.md",
    resourceName: "Khora Registry",
    deviceVerificationPath: "/cli/link",
    defaultSourceApp: "khora-cli",
  });

  const host = createRegistryHost({
    db: registry,
    identity,
    adminTokenAuth: createAdminTokenAuthFromEnv(),
    publicUrl,
    resolveTrustedOrigins,
  });

  return { host, identityRoutes };
}
