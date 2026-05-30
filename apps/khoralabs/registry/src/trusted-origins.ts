import type { Database } from "bun:sqlite";
import { listCorsTrustedOrigins } from "@khoralabs/users";

export function readRegistrySelfOrigins(): string[] {
  const port = process.env.PORT?.trim() ?? "4000";
  const registryUrl =
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ?? `http://localhost:${port}`;
  return [...new Set([registryUrl, `http://localhost:${port}`, `http://127.0.0.1:${port}`])];
}

export function readRegistryTrustedOrigins(db: Database): string[] {
  return [...new Set([...readRegistrySelfOrigins(), ...listCorsTrustedOrigins(db)])];
}
