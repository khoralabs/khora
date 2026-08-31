import { assertEncryptionKeys, EnvKeyProvider } from "@khoralabs/colonnade/crypto";
import { createAdminTokenAuthFromEnv } from "@khoralabs/khora-auth";
import type { RegistryHostContext, RegistryIdentityRoutes } from "@khoralabs/khora-registry/host";
import {
  composeRegistryHost,
  readRegistryTrustedOrigins,
  resolveRegistryPublicUrl,
} from "@khoralabs/khora-registry/host";
import { openRegistrySqliteDatabase } from "@khoralabs/khora-registry/sqlite";
import {
  createBetterAuthHttpPort,
  createBetterAuthRegistryIdentity,
  initRegistryAppSchema,
  reloadRegistryAuth,
} from "./services/auth";

export async function bootstrapRegistryHost(): Promise<{
  host: RegistryHostContext;
  identityRoutes: RegistryIdentityRoutes;
}> {
  await assertEncryptionKeys(new EnvKeyProvider(), "registry");

  const bundle = await openRegistrySqliteDatabase();
  await initRegistryAppSchema(bundle.registry, bundle.db);
  reloadRegistryAuth({ database: bundle.db, domainDatabase: bundle.registry });

  const resolveTrustedOrigins = () => readRegistryTrustedOrigins(bundle.registry);
  const publicUrl = () => resolveRegistryPublicUrl();
  const identity = createBetterAuthRegistryIdentity({ resolveTrustedOrigins });
  const authHttp = createBetterAuthHttpPort({ publicUrl });

  return composeRegistryHost({
    db: bundle.registry,
    identity,
    authHttp,
    adminTokenAuth: createAdminTokenAuthFromEnv(),
    publicUrl,
    resolveTrustedOrigins,
    identityRouteOptions: {
      authMdUrl: process.env.KHORA_AUTH_MD_URL?.trim() || "https://khoralabs.com/auth.md",
      resourceName: "Khora Registry",
      deviceVerificationPath: "/cli/link",
      defaultSourceApp: "khora-cli",
    },
  });
}
