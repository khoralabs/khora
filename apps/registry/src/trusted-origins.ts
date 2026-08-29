import { getRegistryDomainDatabase } from "@khoralabs/registry-auth";
import { readRegistryTrustedOrigins as readHostTrustedOrigins } from "@khoralabs/registry-host";

export function readRegistrySelfOrigins(): string[] {
  const port = process.env.PORT?.trim() ?? "4000";
  const registryUrl =
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ?? `http://localhost:${port}`;
  return [...new Set([registryUrl, `http://localhost:${port}`, `http://127.0.0.1:${port}`])];
}

/** Registry + trusted host origins (see @khoralabs/registry-host readRegistryTrustedOrigins). */
export async function readRegistryTrustedOrigins(): Promise<string[]> {
  return readHostTrustedOrigins(getRegistryDomainDatabase());
}
