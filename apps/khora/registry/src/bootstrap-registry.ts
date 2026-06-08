import { assertEncryptionKeys, EnvKeyProvider } from "@khoralabs/colonnade-crypto";
import { createConsoleAuthFromEnv } from "@khoralabs/khora-console";
import {
  createBetterAuthRegistryIdentity,
  createBetterAuthRegistryRoutes,
  ensureRegistrySchema,
  getRegistryDatabase,
} from "@khoralabs/registry-auth";
import type { RegistryHostContext, RegistryIdentityRoutes } from "@khoralabs/registry-host";
import { createRegistryHost, readRegistryTrustedOrigins } from "@khoralabs/registry-host";

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
  await ensureRegistrySchema();
  const db = getRegistryDatabase();
  const resolveTrustedOrigins = () => readRegistryTrustedOrigins(db);
  const publicUrl = registryPublicUrl;

  const identity = createBetterAuthRegistryIdentity({ resolveTrustedOrigins });
  const identityRoutes = createBetterAuthRegistryRoutes({
    db,
    identity,
    publicUrl,
    authMdUrl: process.env.KHORA_AUTH_MD_URL?.trim() || "https://khoralabs.com/auth.md",
    resourceName: "Khora Registry",
    deviceVerificationPath: "/cli/link",
    defaultSourceApp: "khora-cli",
  });

  const host = createRegistryHost({
    db,
    identity,
    consoleAuth: createConsoleAuthFromEnv(),
    publicUrl,
    resolveTrustedOrigins,
  });

  return { host, identityRoutes };
}
