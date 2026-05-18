/**
 * - PORT: HTTP port (default 8788).
 * - AT2_CATALOG_PATH: SQLite catalog DB (required).
 * - AT2_FRAMES_DB_PATH: SQLite frames / frame-channel DB (required).
 * - AT2_RELAY_TENANT_KEY: optional relay tenant key (library default "relay").
 * - AT2_HOST_UNARY_TRANSPORT: unset / `http` → HTTP only; `stdio` → NDJSON stdin/out parallel to HTTP.
 * - AT2_HOST_DUPLEX_INGRESS: `off` (default) or `unix`.
 * - AT2_HOST_DUPLEX_UNIX_PATH: required when `AT2_HOST_DUPLEX_INGRESS=unix`.
 */

/** Default HTTP ingress via Bun only (no parallel unary listener). */
export type At2HostUnaryIngressMode = "off" | "stdio";

/**
 * Parallel unary ingress for mirrors-of-HTTP (IPC twins).
 * - unset / empty / `http`: Bun HTTP only (default).
 * - `stdio`: NDJSON stdin/out unary framing alongside Bun HTTP (see `startStdioUnaryIngress`).
 */
export function envHostUnaryIngress(): At2HostUnaryIngressMode {
  const v = process.env.AT2_HOST_UNARY_TRANSPORT?.trim().toLowerCase();
  if (v === undefined || v === "" || v === "http") return "off";
  if (v === "stdio") return "stdio";
  throw new Error(
    `AT2_HOST_UNARY_TRANSPORT=${v} is not supported; use http (default) or stdio.`,
  );
}

/** Parallel duplex ingress (opaque binary after JSON handshake line). Default off. */
export type At2HostDuplexIngressMode = "off" | "unix";

/** unset / empty / `off` → no duplex listener (default). `unix` → bind Unix socket at {@link envHostDuplexUnixPath}. */
export function envHostDuplexIngress(): At2HostDuplexIngressMode {
  const v = process.env.AT2_HOST_DUPLEX_INGRESS?.trim().toLowerCase();
  if (v === undefined || v === "" || v === "off") return "off";
  if (v === "unix") return "unix";
  throw new Error(`AT2_HOST_DUPLEX_INGRESS=${v} is not supported; use off (default) or unix.`);
}

export function envHostDuplexUnixPath(): string {
  const p = process.env.AT2_HOST_DUPLEX_UNIX_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error(
      "Set AT2_HOST_DUPLEX_UNIX_PATH when AT2_HOST_DUPLEX_INGRESS=unix (filesystem path for the socket).",
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
  const p = process.env.AT2_CATALOG_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("Set AT2_CATALOG_PATH to the catalog SQLite file path");
  }
  return p;
}

export function envFramesDbPath(): string {
  const p = process.env.AT2_FRAMES_DB_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("Set AT2_FRAMES_DB_PATH to the frames SQLite file path");
  }
  return p;
}

export function envTenantKey(): string | undefined {
  const p = process.env.AT2_RELAY_TENANT_KEY?.trim();
  return p !== undefined && p.length > 0 ? p : undefined;
}
