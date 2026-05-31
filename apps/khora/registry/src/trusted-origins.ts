import type { Database } from "bun:sqlite";
import { listRegistryTrustedOrigins } from "@khoralabs/users";

export function readRegistrySelfOrigins(): string[] {
  const port = process.env.PORT?.trim() ?? "4000";
  const registryUrl =
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ?? `http://localhost:${port}`;
  return [...new Set([registryUrl, `http://localhost:${port}`, `http://127.0.0.1:${port}`])];
}

/** Registry + trusted host origins (see @khoralabs/users listRegistryTrustedOrigins). */
export function readRegistryTrustedOrigins(db: Database): string[] {
  return [...new Set([...readRegistrySelfOrigins(), ...listRegistryTrustedOrigins(db)])];
}
