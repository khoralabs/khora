import type { Database } from "bun:sqlite";
import type {
  HostRegistryState,
  HostTrustedOrigin,
  HostTrustedOriginQuotaRequest,
  HostTrustedOriginRequest,
  KhoraHost,
} from "@khoralabs/registry-catalog-contracts";
import { verifyHostManagementToken as verifyHostManagementTokenId } from "./host-management-token";
import { findHostById, listActiveHosts } from "./khora-hosts";
import type {
  HostTrustedOriginQuotaRequestRow,
  HostTrustedOriginRequestRow,
  HostTrustedOriginRow,
} from "./types-internal";
import {
  HOST_TRUSTED_ORIGIN_QUOTA_REQUEST_SELECT,
  HOST_TRUSTED_ORIGIN_REQUEST_SELECT,
  HOST_TRUSTED_ORIGIN_SELECT,
} from "./types-internal";

export type { HostRegistryState } from "@khoralabs/registry-catalog-contracts";

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

export function countPendingHostTrustedOriginRequests(db: Database, hostId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM host_trusted_origin_requests WHERE host_id = ? AND status = 'pending'`,
    )
    .get(hostId) as { n: number };
  return row.n;
}

export function countAllPendingHostTrustedOriginRequests(db: Database): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM host_trusted_origin_requests WHERE status = 'pending'`)
    .get() as { n: number };
  return row.n;
}

export function countAllPendingHostTrustedOriginQuotaRequests(db: Database): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM host_trusted_origin_quota_requests WHERE status = 'pending'`,
    )
    .get() as { n: number };
  return row.n;
}

function mapOriginRequest(row: HostTrustedOriginRequestRow): HostTrustedOriginRequest {
  return {
    id: row.id,
    hostId: row.host_id,
    origin: row.origin,
    status: row.status as HostTrustedOriginRequest["status"],
    requestedAtMs: row.requested_at_ms,
    reviewedAtMs: row.reviewed_at_ms,
  };
}

function findOriginRequestById(db: Database, requestId: string): HostTrustedOriginRequest | null {
  const row = db
    .prepare(
      `SELECT ${HOST_TRUSTED_ORIGIN_REQUEST_SELECT} FROM host_trusted_origin_requests WHERE id = ? LIMIT 1`,
    )
    .get(requestId) as HostTrustedOriginRequestRow | null;
  return row === null ? null : mapOriginRequest(row);
}

function assertOriginNotRegisteredElsewhere(db: Database, hostId: string, origin: string): void {
  const approved = db
    .prepare(`SELECT host_id FROM host_trusted_origins WHERE origin = ? LIMIT 1`)
    .get(origin) as { host_id: string } | null;
  if (approved !== null && approved.host_id !== hostId) {
    throw new TrustedOriginConflictError(origin);
  }
  const pending = db
    .prepare(
      `SELECT host_id FROM host_trusted_origin_requests
       WHERE origin = ? AND status = 'pending' LIMIT 1`,
    )
    .get(origin) as { host_id: string } | null;
  if (pending !== null && pending.host_id !== hostId) {
    throw new TrustedOriginConflictError(origin);
  }
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

export function listHostTrustedOriginRequests(
  db: Database,
  hostId: string,
  status?: HostTrustedOriginRequest["status"],
): HostTrustedOriginRequest[] {
  const rows =
    status === undefined
      ? (db
          .prepare(
            `SELECT ${HOST_TRUSTED_ORIGIN_REQUEST_SELECT}
             FROM host_trusted_origin_requests WHERE host_id = ?
             ORDER BY requested_at_ms DESC`,
          )
          .all(hostId) as HostTrustedOriginRequestRow[])
      : (db
          .prepare(
            `SELECT ${HOST_TRUSTED_ORIGIN_REQUEST_SELECT}
             FROM host_trusted_origin_requests WHERE host_id = ? AND status = ?
             ORDER BY requested_at_ms DESC`,
          )
          .all(hostId, status) as HostTrustedOriginRequestRow[]);
  return rows.map(mapOriginRequest);
}

export function requestHostTrustedOrigin(
  db: Database,
  hostId: string,
  rawOrigin: string,
): HostTrustedOriginRequest {
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  if (host.status !== "active") {
    throw new Error("only active hosts can request trusted origins");
  }
  const origin = normalizeTrustedOrigin(rawOrigin);
  assertOriginNotRegisteredElsewhere(db, hostId, origin);

  const existingApproved = db
    .prepare(`SELECT id FROM host_trusted_origins WHERE host_id = ? AND origin = ? LIMIT 1`)
    .get(hostId, origin);
  if (existingApproved !== null && existingApproved !== undefined) {
    throw new InvalidTrustedOriginError("origin is already approved");
  }

  const existingPending = db
    .prepare(
      `SELECT id FROM host_trusted_origin_requests
       WHERE host_id = ? AND origin = ? AND status = 'pending' LIMIT 1`,
    )
    .get(hostId, origin);
  if (existingPending !== null && existingPending !== undefined) {
    throw new InvalidTrustedOriginError("origin request is already pending");
  }

  const nextCount =
    countHostTrustedOrigins(db, hostId) + countPendingHostTrustedOriginRequests(db, hostId) + 1;
  assertOriginQuota(host, nextCount);

  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO host_trusted_origin_requests
       (id, host_id, origin, status, requested_at_ms)
     VALUES (?, ?, ?, 'pending', ?)`,
  ).run(id, hostId, origin, now);
  const created = findOriginRequestById(db, id);
  if (created === null) {
    throw new Error("origin request insert failed");
  }
  return created;
}

export function cancelHostTrustedOriginRequest(
  db: Database,
  hostId: string,
  requestId: string,
): void {
  const request = findOriginRequestById(db, requestId);
  if (request === null || request.hostId !== hostId) {
    throw new Error("origin request not found");
  }
  if (request.status !== "pending") {
    throw new Error("only pending origin requests can be cancelled");
  }
  db.prepare(`DELETE FROM host_trusted_origin_requests WHERE id = ?`).run(requestId);
}

export function approveHostTrustedOriginRequest(
  db: Database,
  requestId: string,
): { host: KhoraHost; request: HostTrustedOriginRequest } {
  const request = findOriginRequestById(db, requestId);
  if (request === null) {
    throw new Error("origin request not found");
  }
  if (request.status !== "pending") {
    throw new Error("origin request is not pending");
  }
  const host = addHostTrustedOrigin(db, request.hostId, request.origin);
  const now = Date.now();
  db.prepare(
    `UPDATE host_trusted_origin_requests
     SET status = 'approved', reviewed_at_ms = ?
     WHERE id = ?`,
  ).run(now, requestId);
  const updated = findOriginRequestById(db, requestId);
  if (updated === null) {
    throw new Error("origin request approve failed");
  }
  return { host, request: updated };
}

export function rejectHostTrustedOriginRequest(
  db: Database,
  requestId: string,
): HostTrustedOriginRequest {
  const request = findOriginRequestById(db, requestId);
  if (request === null) {
    throw new Error("origin request not found");
  }
  if (request.status !== "pending") {
    throw new Error("origin request is not pending");
  }
  const now = Date.now();
  db.prepare(
    `UPDATE host_trusted_origin_requests
     SET status = 'rejected', reviewed_at_ms = ?
     WHERE id = ?`,
  ).run(now, requestId);
  const updated = findOriginRequestById(db, requestId);
  if (updated === null) {
    throw new Error("origin request reject failed");
  }
  return updated;
}

function mapQuotaRequest(row: HostTrustedOriginQuotaRequestRow): HostTrustedOriginQuotaRequest {
  return {
    id: row.id,
    hostId: row.host_id,
    requestedIncluded: row.requested_included,
    status: row.status as HostTrustedOriginQuotaRequest["status"],
    requestedAtMs: row.requested_at_ms,
    reviewedAtMs: row.reviewed_at_ms,
  };
}

function findQuotaRequestById(
  db: Database,
  requestId: string,
): HostTrustedOriginQuotaRequest | null {
  const row = db
    .prepare(
      `SELECT ${HOST_TRUSTED_ORIGIN_QUOTA_REQUEST_SELECT}
       FROM host_trusted_origin_quota_requests WHERE id = ? LIMIT 1`,
    )
    .get(requestId) as HostTrustedOriginQuotaRequestRow | null;
  return row === null ? null : mapQuotaRequest(row);
}

export function listHostTrustedOriginQuotaRequests(
  db: Database,
  hostId: string,
  status?: HostTrustedOriginQuotaRequest["status"],
): HostTrustedOriginQuotaRequest[] {
  const rows =
    status === undefined
      ? (db
          .prepare(
            `SELECT ${HOST_TRUSTED_ORIGIN_QUOTA_REQUEST_SELECT}
             FROM host_trusted_origin_quota_requests WHERE host_id = ?
             ORDER BY requested_at_ms DESC`,
          )
          .all(hostId) as HostTrustedOriginQuotaRequestRow[])
      : (db
          .prepare(
            `SELECT ${HOST_TRUSTED_ORIGIN_QUOTA_REQUEST_SELECT}
             FROM host_trusted_origin_quota_requests WHERE host_id = ? AND status = ?
             ORDER BY requested_at_ms DESC`,
          )
          .all(hostId, status) as HostTrustedOriginQuotaRequestRow[]);
  return rows.map(mapQuotaRequest);
}

export function findPendingHostTrustedOriginQuotaRequest(
  db: Database,
  hostId: string,
): HostTrustedOriginQuotaRequest | null {
  const rows = listHostTrustedOriginQuotaRequests(db, hostId, "pending");
  return rows[0] ?? null;
}

export function requestHostTrustedOriginQuota(
  db: Database,
  hostId: string,
  requestedIncluded: number,
): HostTrustedOriginQuotaRequest {
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  if (host.status !== "active") {
    throw new Error("only active hosts can request trusted origin quota");
  }
  if (!Number.isFinite(requestedIncluded) || requestedIncluded < 0) {
    throw new Error("requested included trusted origins must be a non-negative number");
  }
  const target = Math.floor(requestedIncluded);
  if (target <= host.includedTrustedOrigins) {
    throw new Error("requested quota must exceed current included trusted origins");
  }
  const existingPending = findPendingHostTrustedOriginQuotaRequest(db, hostId);
  if (existingPending !== null) {
    throw new Error("quota request is already pending");
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO host_trusted_origin_quota_requests
       (id, host_id, requested_included, status, requested_at_ms)
     VALUES (?, ?, ?, 'pending', ?)`,
  ).run(id, hostId, target, now);
  const created = findQuotaRequestById(db, id);
  if (created === null) {
    throw new Error("quota request insert failed");
  }
  return created;
}

export function cancelHostTrustedOriginQuotaRequest(
  db: Database,
  hostId: string,
  requestId: string,
): void {
  const request = findQuotaRequestById(db, requestId);
  if (request === null || request.hostId !== hostId) {
    throw new Error("quota request not found");
  }
  if (request.status !== "pending") {
    throw new Error("only pending quota requests can be cancelled");
  }
  db.prepare(`DELETE FROM host_trusted_origin_quota_requests WHERE id = ?`).run(requestId);
}

export function approveHostTrustedOriginQuotaRequest(
  db: Database,
  requestId: string,
): { host: KhoraHost; request: HostTrustedOriginQuotaRequest } {
  const request = findQuotaRequestById(db, requestId);
  if (request === null) {
    throw new Error("quota request not found");
  }
  if (request.status !== "pending") {
    throw new Error("quota request is not pending");
  }
  const host = setHostIncludedTrustedOrigins(db, request.hostId, request.requestedIncluded);
  const now = Date.now();
  db.prepare(
    `UPDATE host_trusted_origin_quota_requests
     SET status = 'approved', reviewed_at_ms = ?
     WHERE id = ?`,
  ).run(now, requestId);
  const updated = findQuotaRequestById(db, requestId);
  if (updated === null) {
    throw new Error("quota request approve failed");
  }
  return { host, request: updated };
}

export function rejectHostTrustedOriginQuotaRequest(
  db: Database,
  requestId: string,
): HostTrustedOriginQuotaRequest {
  const request = findQuotaRequestById(db, requestId);
  if (request === null) {
    throw new Error("quota request not found");
  }
  if (request.status !== "pending") {
    throw new Error("quota request is not pending");
  }
  const now = Date.now();
  db.prepare(
    `UPDATE host_trusted_origin_quota_requests
     SET status = 'rejected', reviewed_at_ms = ?
     WHERE id = ?`,
  ).run(now, requestId);
  const updated = findQuotaRequestById(db, requestId);
  if (updated === null) {
    throw new Error("quota request reject failed");
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

export function readHostRegistryState(db: Database, hostId: string): HostRegistryState | null {
  const host = findHostById(db, hostId);
  if (host === null) {
    return null;
  }
  const origins = listHostTrustedOriginStrings(db, hostId);
  const pendingOriginRequests = listHostTrustedOriginRequests(db, hostId, "pending");
  const pendingQuotaRequest = findPendingHostTrustedOriginQuotaRequest(db, hostId);
  return {
    participationEnabled: host.registryParticipationEnabled,
    origins,
    pendingOriginRequests,
    pendingQuotaRequest,
    quota: {
      used: origins.length,
      pending: pendingOriginRequests.length,
      included: host.includedTrustedOrigins,
    },
  };
}
