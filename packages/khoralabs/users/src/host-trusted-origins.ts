import type { Database } from "bun:sqlite";
import { verifyHostManagementToken as verifyHostManagementTokenId } from "./host-management-token";
import { findHostById, listActiveHosts } from "./khora-hosts";
import type { HostTrustedOrigin, HostTrustedOriginRow, KhoraHost } from "./types";
import { HOST_TRUSTED_ORIGIN_SELECT } from "./types";

export function verifyHostManagementToken(
  db: Database,
  slug: string,
  token: string,
): KhoraHost | null {
  const hostId = verifyHostManagementTokenId(db, slug, token);
  if (hostId === null) {
    return null;
  }
  return findHostById(db, hostId);
}

export class InvalidTrustedOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTrustedOriginError";
  }
}

export class OriginQuotaExceededError extends Error {
  readonly hostId: string;
  readonly limit: number;
  readonly requested: number;

  constructor(hostId: string, limit: number, requested: number) {
    super(
      `trusted origin quota exceeded for host ${hostId}: ${requested} requested, limit ${limit}`,
    );
    this.name = "OriginQuotaExceededError";
    this.hostId = hostId;
    this.limit = limit;
    this.requested = requested;
  }
}

export class TrustedOriginConflictError extends Error {
  constructor(origin: string) {
    super(`trusted origin already registered: ${origin}`);
    this.name = "TrustedOriginConflictError";
  }
}

/** Normalize and validate a browser origin (scheme + host + port, no path). */
export function normalizeTrustedOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InvalidTrustedOriginError("trusted origin is empty");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidTrustedOriginError(`invalid trusted origin: ${raw}`);
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new InvalidTrustedOriginError("trusted origin must not include a path");
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new InvalidTrustedOriginError("trusted origin must not include query or hash");
  }
  return url.origin;
}

function mapTrustedOrigin(row: HostTrustedOriginRow): HostTrustedOrigin {
  return {
    id: row.id,
    hostId: row.host_id,
    origin: row.origin,
    createdAtMs: row.created_at_ms,
  };
}

export function countHostTrustedOrigins(db: Database, hostId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM host_trusted_origins WHERE host_id = ?`)
    .get(hostId) as { n: number };
  return row.n;
}

export function assertOriginQuota(host: KhoraHost, nextCount: number): void {
  if (nextCount > host.includedTrustedOrigins) {
    throw new OriginQuotaExceededError(host.id, host.includedTrustedOrigins, nextCount);
  }
}

export function listHostTrustedOrigins(db: Database, hostId: string): HostTrustedOrigin[] {
  const rows = db
    .prepare(
      `SELECT ${HOST_TRUSTED_ORIGIN_SELECT} FROM host_trusted_origins WHERE host_id = ? ORDER BY origin ASC`,
    )
    .all(hostId) as HostTrustedOriginRow[];
  return rows.map(mapTrustedOrigin);
}

export function listHostTrustedOriginStrings(db: Database, hostId: string): string[] {
  return listHostTrustedOrigins(db, hostId).map((row) => row.origin);
}

export function addHostTrustedOrigin(db: Database, hostId: string, rawOrigin: string): KhoraHost {
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  const origin = normalizeTrustedOrigin(rawOrigin);
  const nextCount = countHostTrustedOrigins(db, hostId) + 1;
  assertOriginQuota(host, nextCount);

  const existingGlobal = db
    .prepare(`SELECT host_id FROM host_trusted_origins WHERE origin = ? LIMIT 1`)
    .get(origin) as { host_id: string } | null;
  if (existingGlobal !== null && existingGlobal.host_id !== hostId) {
    throw new TrustedOriginConflictError(origin);
  }
  if (existingGlobal !== null) {
    return host;
  }

  db.prepare(
    `INSERT INTO host_trusted_origins (id, host_id, origin, created_at_ms) VALUES (?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), hostId, origin, Date.now());

  const updated = findHostById(db, hostId);
  if (updated === null) {
    throw new Error("host trusted origin insert failed");
  }
  return updated;
}

export function removeHostTrustedOrigin(
  db: Database,
  hostId: string,
  rawOrigin: string,
): KhoraHost {
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  const origin = normalizeTrustedOrigin(rawOrigin);
  db.prepare(`DELETE FROM host_trusted_origins WHERE host_id = ? AND origin = ?`).run(
    hostId,
    origin,
  );
  const updated = findHostById(db, hostId);
  if (updated === null) {
    throw new Error("host trusted origin delete failed");
  }
  return updated;
}

export function replaceHostTrustedOrigins(
  db: Database,
  hostId: string,
  rawOrigins: string[],
): KhoraHost {
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  const origins = [...new Set(rawOrigins.map(normalizeTrustedOrigin))];
  assertOriginQuota(host, origins.length);

  for (const origin of origins) {
    const existingGlobal = db
      .prepare(`SELECT host_id FROM host_trusted_origins WHERE origin = ? LIMIT 1`)
      .get(origin) as { host_id: string } | null;
    if (existingGlobal !== null && existingGlobal.host_id !== hostId) {
      throw new TrustedOriginConflictError(origin);
    }
  }

  db.prepare(`DELETE FROM host_trusted_origins WHERE host_id = ?`).run(hostId);
  const insert = db.prepare(
    `INSERT INTO host_trusted_origins (id, host_id, origin, created_at_ms) VALUES (?, ?, ?, ?)`,
  );
  const now = Date.now();
  for (const origin of origins) {
    insert.run(crypto.randomUUID(), hostId, origin, now);
  }

  const updated = findHostById(db, hostId);
  if (updated === null) {
    throw new Error("host trusted origins replace failed");
  }
  return updated;
}

export function setHostRegistryParticipation(
  db: Database,
  hostId: string,
  enabled: boolean,
): KhoraHost {
  const existing = findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  if (enabled && existing.status !== "active") {
    throw new Error("only active hosts can participate in the registry");
  }
  db.prepare(`UPDATE khora_hosts SET registry_participation_enabled = ? WHERE id = ?`).run(
    enabled ? 1 : 0,
    hostId,
  );
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host registry participation update failed");
  }
  return host;
}

export function setHostIncludedTrustedOrigins(
  db: Database,
  hostId: string,
  included: number,
): KhoraHost {
  const existing = findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  if (!Number.isFinite(included) || included < 0) {
    throw new Error("included trusted origins must be a non-negative number");
  }
  db.prepare(`UPDATE khora_hosts SET included_trusted_origins = ? WHERE id = ?`).run(
    Math.floor(included),
    hostId,
  );
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host included trusted origins update failed");
  }
  return host;
}

export function updateHostRegistrySettings(
  db: Database,
  hostId: string,
  params: {
    registryParticipationEnabled?: boolean;
    origins?: string[];
    includedTrustedOrigins?: number;
  },
): KhoraHost {
  if (params.includedTrustedOrigins !== undefined) {
    setHostIncludedTrustedOrigins(db, hostId, params.includedTrustedOrigins);
  }
  if (params.origins !== undefined) {
    replaceHostTrustedOrigins(db, hostId, params.origins);
  }
  if (params.registryParticipationEnabled !== undefined) {
    return setHostRegistryParticipation(db, hostId, params.registryParticipationEnabled);
  }
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  return host;
}

/** Origins from active participating hosts with at least one trusted origin row. */
export function listRegistryTrustedOrigins(db: Database): string[] {
  const origins: string[] = [];
  for (const host of listActiveHosts(db)) {
    if (!host.registryParticipationEnabled) {
      continue;
    }
    origins.push(...listHostTrustedOriginStrings(db, host.id));
  }
  return [...new Set(origins)];
}

export type HostRegistryState = {
  participationEnabled: boolean;
  origins: string[];
  quota: { used: number; included: number };
};

export function readHostRegistryState(db: Database, hostId: string): HostRegistryState | null {
  const host = findHostById(db, hostId);
  if (host === null) {
    return null;
  }
  const origins = listHostTrustedOriginStrings(db, hostId);
  return {
    participationEnabled: host.registryParticipationEnabled,
    origins,
    quota: {
      used: origins.length,
      included: host.includedTrustedOrigins,
    },
  };
}
