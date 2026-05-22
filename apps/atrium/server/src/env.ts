import type { AtriumMemoriesConfig } from "@khoralabs/atrium-host";
import {
  createAtriumEmbeddingModelFromEnv,
  readAtriumMemoriesNamespaceRoot,
} from "@khoralabs/atrium-host";

/**
 * - PORT: HTTP port (default 8788).
 * - ATRIUM_CATALOG_PATH: SQLite catalog DB (required).
 * - ATRIUM_FRAMES_DB_PATH: SQLite frames / frame-channel DB (required).
 * - ATRIUM_CELLS_DIR: directory for colonnade cell SQLite shards (required).
 * - ATRIUM_CELL_POOL_COUNT: pool shard count for assignPrincipalToCell (optional, default 16).
 * - ATRIUM_COLONNADE_CELL_WORKERS: when unset/1/on, cell DBs use Bun Workers (bench `--cell-workers`); 0/off uses main-thread SQLite.
 * - ATRIUM_RELAY_TENANT_KEY: optional relay tenant key (library default "relay").
 * - ATRIUM_MEMORIES_DB_PATH: SQLite memories index (optional; enables POST /v1/search).
 * - ATRIUM_MEMORIES_NAMESPACE_ROOT: relay-wide namespace root (default `global`).
 * - ATRIUM_EMBEDDING_*: embedding provider config (see @khoralabs/atrium-host memories-config).
 * - ATRIUM_HOST_UNARY_TRANSPORT: unset / `http` → HTTP only; `stdio` → NDJSON stdin/out parallel to HTTP.
 * - ATRIUM_HOST_DUPLEX_INGRESS: `off` (default) or `unix`.
 * - ATRIUM_HOST_DUPLEX_UNIX_PATH: required when `ATRIUM_HOST_DUPLEX_INGRESS=unix`.
 * - LOG_LEVEL: pino log level (default `info`, e.g. `debug`, `warn`, `error`).
 */

/** Default HTTP ingress via Bun only (no parallel unary listener). */
export type AtriumHostUnaryIngressMode = "off" | "stdio";

/**
 * Parallel unary ingress for mirrors-of-HTTP (IPC twins).
 * - unset / empty / `http`: Bun HTTP only (default).
 * - `stdio`: NDJSON stdin/out unary framing alongside Bun HTTP (see `startStdioUnaryIngress`).
 */
export function envHostUnaryIngress(): AtriumHostUnaryIngressMode {
  const v = process.env.ATRIUM_HOST_UNARY_TRANSPORT?.trim().toLowerCase();
  if (v === undefined || v === "" || v === "http") return "off";
  if (v === "stdio") return "stdio";
  throw new Error(
    `ATRIUM_HOST_UNARY_TRANSPORT=${v} is not supported; use http (default) or stdio.`,
  );
}

/** Parallel duplex ingress (opaque binary after JSON handshake line). Default off. */
export type AtriumHostDuplexIngressMode = "off" | "unix";

/** unset / empty / `off` → no duplex listener (default). `unix` → bind Unix socket at {@link envHostDuplexUnixPath}. */
export function envHostDuplexIngress(): AtriumHostDuplexIngressMode {
  const v = process.env.ATRIUM_HOST_DUPLEX_INGRESS?.trim().toLowerCase();
  if (v === undefined || v === "" || v === "off") return "off";
  if (v === "unix") return "unix";
  throw new Error(`ATRIUM_HOST_DUPLEX_INGRESS=${v} is not supported; use off (default) or unix.`);
}

export function envHostDuplexUnixPath(): string {
  const p = process.env.ATRIUM_HOST_DUPLEX_UNIX_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error(
      "Set ATRIUM_HOST_DUPLEX_UNIX_PATH when ATRIUM_HOST_DUPLEX_INGRESS=unix (filesystem path for the socket).",
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
  const p = process.env.ATRIUM_CATALOG_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("Set ATRIUM_CATALOG_PATH to the catalog SQLite file path");
  }
  return p;
}

export function envFramesDbPath(): string {
  const p = process.env.ATRIUM_FRAMES_DB_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("Set ATRIUM_FRAMES_DB_PATH to the frames SQLite file path");
  }
  return p;
}

export function envCellsDir(): string {
  const p = process.env.ATRIUM_CELLS_DIR?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("Set ATRIUM_CELLS_DIR to the directory for colonnade cell SQLite files");
  }
  return p;
}

export function envCellPoolCount(): number {
  const raw = process.env.ATRIUM_CELL_POOL_COUNT?.trim();
  if (raw === undefined || raw.length === 0) return 16;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 16;
}

/** Matches bench `--cell-workers` when true (default). False matches sqlite strategy without that flag. */
export function envColonnadeUseCellWorkers(): boolean {
  const v = process.env.ATRIUM_COLONNADE_CELL_WORKERS?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

export function envTenantKey(): string | undefined {
  const p = process.env.ATRIUM_RELAY_TENANT_KEY?.trim();
  return p !== undefined && p.length > 0 ? p : undefined;
}

export function envMemoriesDbPath(): string | undefined {
  const p = process.env.ATRIUM_MEMORIES_DB_PATH?.trim();
  return p !== undefined && p.length > 0 ? p : undefined;
}

export function envMemoriesConfig(): AtriumMemoriesConfig | undefined {
  const dbPath = envMemoriesDbPath();
  if (dbPath === undefined) return undefined;
  return {
    dbPath,
    namespaceRoot: readAtriumMemoriesNamespaceRoot(),
    embeddingModel: createAtriumEmbeddingModelFromEnv(),
  };
}

/**
 * Eagerly validates all required env vars at startup.
 * Throws a descriptive error on the first missing/invalid value.
 */
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
