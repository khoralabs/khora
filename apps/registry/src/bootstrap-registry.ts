import { assertEncryptionKeys, EnvKeyProvider } from "@khoralabs/colonnade/crypto";
import { createAdminTokenAuthFromEnv } from "@khoralabs/khora-auth";
import type { RegistryHostContext, RegistryIdentityRoutes } from "@khoralabs/khora-registry/host";
import {
  createRegistryHost,
  createRegistryIdentityRoutes,
  readRegistryTrustedOrigins,
} from "@khoralabs/khora-registry/host";
import { openRegistrySqliteDatabase } from "@khoralabs/khora-registry/sqlite";
import {
  createBetterAuthHttpPort,
  createBetterAuthRegistryIdentity,
  initRegistryAppSchema,
  reloadRegistryAuth,
} from "./services/auth";

function registryPublicUrl(): string {
  const port = process.env.PORT?.trim() ?? "4000";
  const configured =
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ??
    process.env.BETTER_AUTH_URL?.trim()?.replace(/\/$/, "");
  return configured ?? `http://localhost:${port}`;
}

export async function bootstrapRegistryHost(): Promise<{
  host: RegistryHostContext;
  identityRoutes: RegistryIdentityRoutes;
}> {
  await assertEncryptionKeys(new EnvKeyProvider(), "registry");

  const bundle = await openRegistrySqliteDatabase();
  await initRegistryAppSchema(bundle.registry, bundle.db);
  reloadRegistryAuth({ database: bundle.db, domainDatabase: bundle.registry });

  const resolveTrustedOrigins = () => readRegistryTrustedOrigins(bundle.registry);
  const publicUrl = registryPublicUrl;

  const identity = createBetterAuthRegistryIdentity({ resolveTrustedOrigins });
  const authHttp = createBetterAuthHttpPort({ publicUrl });
  const identityRoutes = createRegistryIdentityRoutes({
    db: bundle.registry,
    identity,
    authHttp,
    publicUrl,
    authMdUrl: process.env.KHORA_AUTH_MD_URL?.trim() || "https://khoralabs.com/auth.md",
    resourceName: "Khora Registry",
    deviceVerificationPath: "/cli/link",
    defaultSourceApp: "khora-cli",
  });

  const host = createRegistryHost({
    db: bundle.registry,
    identity,
    adminTokenAuth: createAdminTokenAuthFromEnv(),
    publicUrl,
    resolveTrustedOrigins,
  });

  return { host, identityRoutes };
}
