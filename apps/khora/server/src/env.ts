import type { KhoraMemoriesBootstrapConfig } from "./memories-env.ts";

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

export function envCatalogPath(): string {
  const p = process.env.KHORA_CATALOG_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("Set KHORA_CATALOG_PATH to the catalog SQLite file path");
  }
  return p;
}

export function envFramesDbPath(): string {
  const p = process.env.KHORA_FRAMES_DB_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("Set KHORA_FRAMES_DB_PATH to the frames SQLite file path");
  }
  return p;
}

export function envCellsDir(): string {
  const p = process.env.KHORA_CELLS_DIR?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("Set KHORA_CELLS_DIR to the directory for colonnade cell SQLite files");
  }
  return p;
}

export function envCellPoolCount(): number {
  const raw = process.env.KHORA_CELL_POOL_COUNT?.trim();
  if (raw === undefined || raw.length === 0) return 16;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 16;
}

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

export function validateEnv(): void {
  envCatalogPath();
  envFramesDbPath();
  envCellsDir();
  envPort();
  envHostUnaryIngress();
  const duplexMode = envHostDuplexIngress();
  if (duplexMode === "unix") {
    envHostDuplexUnixPath();
  }
}

export type { KhoraMemoriesBootstrapConfig };
