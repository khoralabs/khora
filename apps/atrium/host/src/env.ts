export function envPort(): number {
  const raw = process.env.PORT ?? process.env.ATRIUM_PORT ?? "8787";
  const p = Number(raw);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 8787;
}

export function envDbPath(): string {
  const p = process.env.ATRIUM_DB_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("Set ATRIUM_DB_PATH to the SQLite file path");
  }
  return p;
}

export function envProfileNamespace(): string {
  return process.env.ATRIUM_PROFILE_NAMESPACE?.trim() || "atrium/profiles";
}

export function envPostNamespace(): string {
  return process.env.ATRIUM_POST_NAMESPACE?.trim() || "atrium/posts";
}

export function envProbeNamespace(): string {
  return process.env.ATRIUM_PROBE_NAMESPACE?.trim() || "atrium/probes";
}

export function envInboxSnapshotLimit(): number {
  const raw = process.env.ATRIUM_INBOX_SNAPSHOT_LIMIT?.trim();
  if (raw === undefined || raw.length === 0) return 50;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : 50;
}

export function envAgentSyncProbeLimit(): number {
  const raw = process.env.ATRIUM_AGENT_SYNC_PROBE_LIMIT?.trim();
  if (raw === undefined || raw.length === 0) return 500;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : 500;
}

/** Parse a non-negative integer ms interval from env. Empty/invalid → undefined (use default). */
export function envIntervalMs(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw.length === 0) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export function allowReregister(): boolean {
  return process.env.ATRIUM_ALLOW_REREGISTER === "1";
}

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
  if (v === "unix") {
    throw new Error(
      "ATRIUM_HOST_UNARY_TRANSPORT=unix is not implemented yet; use stdio or omit for HTTP-only.",
    );
  }
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
  throw new Error(
    `ATRIUM_HOST_DUPLEX_INGRESS=${v} is not supported; use off (default) or unix.`,
  );
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
