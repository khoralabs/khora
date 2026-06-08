import type { Database } from "bun:sqlite";
import { listRegistryTrustedOrigins } from "@khoralabs/registry-catalog";

export function readRegistrySelfOrigins(): string[] {
  const port = process.env.PORT?.trim() ?? "4000";
  const registryUrl =
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ?? `http://localhost:${port}`;
  return [...new Set([registryUrl, `http://localhost:${port}`, `http://127.0.0.1:${port}`])];
}

/** Registry + trusted host origins (see @khoralabs/registry-catalog listRegistryTrustedOrigins). */
export function readRegistryTrustedOrigins(db: Database): string[] {
  return [...new Set([...readRegistrySelfOrigins(), ...listRegistryTrustedOrigins(db)])];
}
