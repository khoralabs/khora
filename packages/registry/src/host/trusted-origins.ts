import { listRegistryTrustedOrigins } from "@khoralabs/khora-registry/catalog";
import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";

export function readRegistrySelfOrigins(): string[] {
  const port = process.env.PORT?.trim() ?? "4000";
  const registryUrl =
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ?? `http://localhost:${port}`;
  return [...new Set([registryUrl, `http://localhost:${port}`, `http://127.0.0.1:${port}`])];
}

/** Registry + trusted host origins (see @khoralabs/khora-registry/catalog listRegistryTrustedOrigins). */
export async function readRegistryTrustedOrigins(db: RegistryDatabase): Promise<string[]> {
  return [...new Set([...readRegistrySelfOrigins(), ...(await listRegistryTrustedOrigins(db))])];
}
