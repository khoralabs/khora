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
