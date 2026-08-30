import type { KhoraMemoriesBootstrapConfig } from "./memories-env";
import { assertKhoraMemoriesDbPathUnset } from "./memories-env";
import { type KhoraPersistencePaths, resolveKhoraPersistencePaths } from "./persistence-paths";

/**
 * Server env for Khora host bootstrap. See `.env.example` for variable names.
 */

/** Default HTTP ingress via Bun only (no parallel unary listener). */
export type KhoraHostUnaryIngressMode = "off" | "stdio";

export function envHostUnaryIngress(): KhoraHostUnaryIngressMode {
  const v = process.env.KHORA_HOST_UNARY_TRANSPORT?.trim().toLowerCase();
  if (v === undefined || v === "" || v === "http") return "off";
  if (v === "stdio") return "stdio";
  throw new Error(`KHORA_HOST_UNARY_TRANSPORT=${v} is not supported; use http (default) or stdio.`);
}

export type KhoraHostDuplexIngressMode = "off" | "unix";

export function envHostDuplexIngress(): KhoraHostDuplexIngressMode {
  const v = process.env.KHORA_HOST_DUPLEX_INGRESS?.trim().toLowerCase();
  if (v === undefined || v === "" || v === "off") return "off";
  if (v === "unix") return "unix";
  throw new Error(`KHORA_HOST_DUPLEX_INGRESS=${v} is not supported; use off (default) or unix.`);
}

export function envHostDuplexUnixPath(): string {
  const p = process.env.KHORA_HOST_DUPLEX_UNIX_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error(
      "Set KHORA_HOST_DUPLEX_UNIX_PATH when KHORA_HOST_DUPLEX_INGRESS=unix (filesystem path for the socket).",
    );
  }
  return p;
}

export function envPort(): number {
  const raw = process.env.PORT?.trim();
  if (raw === undefined || raw.length === 0) return 8788;
  const p = Number(raw);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 8788;
}

export { type KhoraPersistencePaths, resolveKhoraPersistencePaths };

export function envColonnadeUseCellWorkers(): boolean {
  const v = process.env.KHORA_COLONNADE_CELL_WORKERS?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

export function envTenantKey(): string | undefined {
  const p = process.env.KHORA_RELAY_TENANT_KEY?.trim();
  return p !== undefined && p.length > 0 ? p : undefined;
}

export function validateEnv(appRoot?: string): void {
  assertKhoraMemoriesDbPathUnset();
  resolveKhoraPersistencePaths(process.env, appRoot ?? process.cwd());
  envPort();
  envHostUnaryIngress();
  const duplexMode = envHostDuplexIngress();
  if (duplexMode === "unix") {
    envHostDuplexUnixPath();
  }
}

export type { KhoraMemoriesBootstrapConfig };
