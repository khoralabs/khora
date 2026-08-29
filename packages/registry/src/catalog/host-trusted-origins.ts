import type {
  HostRegistryState,
  HostTrustedOrigin,
  HostTrustedOriginQuotaRequest,
  HostTrustedOriginRequest,
  KhoraHost,
} from "@khoralabs/registry/contracts";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
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

export type { HostRegistryState } from "@khoralabs/registry/contracts";

export async function verifyHostManagementToken(
  db: RegistryDatabase,
  slug: string,
  token: string,
): Promise<KhoraHost | null> {
  const hostId = await verifyHostManagementTokenId(db, slug, token);
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

export async function countHostTrustedOrigins(
  db: RegistryDatabase,
  hostId: string,
): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM host_trusted_origins WHERE host_id = ?`,
    [hostId],
  );
  return row?.n ?? 0;
}

export async function countPendingHostTrustedOriginRequests(
  db: RegistryDatabase,
  hostId: string,
): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM host_trusted_origin_requests WHERE host_id = ? AND status = 'pending'`,
    [hostId],
  );
  return row?.n ?? 0;
}

export async function countAllPendingHostTrustedOriginRequests(
  db: RegistryDatabase,
): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM host_trusted_origin_requests WHERE status = 'pending'`,
  );
  return row?.n ?? 0;
}

export async function countAllPendingHostTrustedOriginQuotaRequests(
  db: RegistryDatabase,
): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM host_trusted_origin_quota_requests WHERE status = 'pending'`,
  );
  return row?.n ?? 0;
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

async function findOriginRequestById(
  db: RegistryDatabase,
  requestId: string,
): Promise<HostTrustedOriginRequest | null> {
  const row = await db.queryOne<HostTrustedOriginRequestRow>(
    `SELECT ${HOST_TRUSTED_ORIGIN_REQUEST_SELECT} FROM host_trusted_origin_requests WHERE id = ? LIMIT 1`,
    [requestId],
  );
  return row === undefined ? null : mapOriginRequest(row);
}

async function assertOriginNotRegisteredElsewhere(
  db: RegistryDatabase,
  hostId: string,
  origin: string,
): Promise<void> {
  const approved = await db.queryOne<{ host_id: string }>(
    `SELECT host_id FROM host_trusted_origins WHERE origin = ? LIMIT 1`,
    [origin],
  );
  if (approved !== undefined && approved.host_id !== hostId) {
    throw new TrustedOriginConflictError(origin);
  }
  const pending = await db.queryOne<{ host_id: string }>(
    `SELECT host_id FROM host_trusted_origin_requests
     WHERE origin = ? AND status = 'pending' LIMIT 1`,
    [origin],
  );
  if (pending !== undefined && pending.host_id !== hostId) {
    throw new TrustedOriginConflictError(origin);
  }
}

export function assertOriginQuota(host: KhoraHost, nextCount: number): void {
  if (nextCount > host.includedTrustedOrigins) {
    throw new OriginQuotaExceededError(host.id, host.includedTrustedOrigins, nextCount);
  }
}

export async function listHostTrustedOrigins(
  db: RegistryDatabase,
  hostId: string,
): Promise<HostTrustedOrigin[]> {
  const rows = await db.queryAll<HostTrustedOriginRow>(
    `SELECT ${HOST_TRUSTED_ORIGIN_SELECT} FROM host_trusted_origins WHERE host_id = ? ORDER BY origin ASC`,
    [hostId],
  );
  return rows.map(mapTrustedOrigin);
}

export async function listHostTrustedOriginStrings(
  db: RegistryDatabase,
  hostId: string,
): Promise<string[]> {
  return (await listHostTrustedOrigins(db, hostId)).map((row) => row.origin);
}

export async function addHostTrustedOrigin(
  db: RegistryDatabase,
  hostId: string,
  rawOrigin: string,
): Promise<KhoraHost> {
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  const origin = normalizeTrustedOrigin(rawOrigin);
  const nextCount = (await countHostTrustedOrigins(db, hostId)) + 1;
  assertOriginQuota(host, nextCount);

  const existingGlobal = await db.queryOne<{ host_id: string }>(
    `SELECT host_id FROM host_trusted_origins WHERE origin = ? LIMIT 1`,
    [origin],
  );
  if (existingGlobal !== undefined && existingGlobal.host_id !== hostId) {
    throw new TrustedOriginConflictError(origin);
  }
  if (existingGlobal !== undefined) {
    return host;
  }

  await db.exec(
    `INSERT INTO host_trusted_origins (id, host_id, origin, created_at_ms) VALUES (?, ?, ?, ?)`,
    [crypto.randomUUID(), hostId, origin, Date.now()],
  );

  const updated = await findHostById(db, hostId);
  if (updated === null) {
    throw new Error("host trusted origin insert failed");
  }
  return updated;
}

export async function removeHostTrustedOrigin(
  db: RegistryDatabase,
  hostId: string,
  rawOrigin: string,
): Promise<KhoraHost> {
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  const origin = normalizeTrustedOrigin(rawOrigin);
  await db.exec(`DELETE FROM host_trusted_origins WHERE host_id = ? AND origin = ?`, [
    hostId,
    origin,
  ]);
  const updated = await findHostById(db, hostId);
  if (updated === null) {
    throw new Error("host trusted origin delete failed");
  }
  return updated;
}

export async function replaceHostTrustedOrigins(
  db: RegistryDatabase,
  hostId: string,
  rawOrigins: string[],
): Promise<KhoraHost> {
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  const origins = [...new Set(rawOrigins.map(normalizeTrustedOrigin))];
  assertOriginQuota(host, origins.length);

  for (const origin of origins) {
    const existingGlobal = await db.queryOne<{ host_id: string }>(
      `SELECT host_id FROM host_trusted_origins WHERE origin = ? LIMIT 1`,
      [origin],
    );
    if (existingGlobal !== undefined && existingGlobal.host_id !== hostId) {
      throw new TrustedOriginConflictError(origin);
    }
  }

  await db.exec(`DELETE FROM host_trusted_origins WHERE host_id = ?`, [hostId]);
  const now = Date.now();
  for (const origin of origins) {
    await db.exec(
      `INSERT INTO host_trusted_origins (id, host_id, origin, created_at_ms) VALUES (?, ?, ?, ?)`,
      [crypto.randomUUID(), hostId, origin, now],
    );
  }

  const updated = await findHostById(db, hostId);
  if (updated === null) {
    throw new Error("host trusted origins replace failed");
  }
  return updated;
}

export async function listHostTrustedOriginRequests(
  db: RegistryDatabase,
  hostId: string,
  status?: HostTrustedOriginRequest["status"],
): Promise<HostTrustedOriginRequest[]> {
  const rows =
    status === undefined
      ? await db.queryAll<HostTrustedOriginRequestRow>(
          `SELECT ${HOST_TRUSTED_ORIGIN_REQUEST_SELECT}
           FROM host_trusted_origin_requests WHERE host_id = ?
           ORDER BY requested_at_ms DESC`,
          [hostId],
        )
      : await db.queryAll<HostTrustedOriginRequestRow>(
          `SELECT ${HOST_TRUSTED_ORIGIN_REQUEST_SELECT}
           FROM host_trusted_origin_requests WHERE host_id = ? AND status = ?
           ORDER BY requested_at_ms DESC`,
          [hostId, status],
        );
  return rows.map(mapOriginRequest);
}

export async function requestHostTrustedOrigin(
  db: RegistryDatabase,
  hostId: string,
  rawOrigin: string,
): Promise<HostTrustedOriginRequest> {
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  if (host.status !== "active") {
    throw new Error("only active hosts can request trusted origins");
  }
  const origin = normalizeTrustedOrigin(rawOrigin);
  await assertOriginNotRegisteredElsewhere(db, hostId, origin);

  const existingApproved = await db.queryOne<{ id: string }>(
    `SELECT id FROM host_trusted_origins WHERE host_id = ? AND origin = ? LIMIT 1`,
    [hostId, origin],
  );
  if (existingApproved !== undefined) {
    throw new InvalidTrustedOriginError("origin is already approved");
  }

  const existingPending = await db.queryOne<{ id: string }>(
    `SELECT id FROM host_trusted_origin_requests
     WHERE host_id = ? AND origin = ? AND status = 'pending' LIMIT 1`,
    [hostId, origin],
  );
  if (existingPending !== undefined) {
    throw new InvalidTrustedOriginError("origin request is already pending");
  }

  const nextCount =
    (await countHostTrustedOrigins(db, hostId)) +
    (await countPendingHostTrustedOriginRequests(db, hostId)) +
    1;
  assertOriginQuota(host, nextCount);

  const id = crypto.randomUUID();
  const now = Date.now();
  await db.exec(
    `INSERT INTO host_trusted_origin_requests
       (id, host_id, origin, status, requested_at_ms)
     VALUES (?, ?, ?, 'pending', ?)`,
    [id, hostId, origin, now],
  );
  const created = await findOriginRequestById(db, id);
  if (created === null) {
    throw new Error("origin request insert failed");
  }
  return created;
}

export async function cancelHostTrustedOriginRequest(
  db: RegistryDatabase,
  hostId: string,
  requestId: string,
): Promise<void> {
  const request = await findOriginRequestById(db, requestId);
  if (request === null || request.hostId !== hostId) {
    throw new Error("origin request not found");
  }
  if (request.status !== "pending") {
    throw new Error("only pending origin requests can be cancelled");
  }
  await db.exec(`DELETE FROM host_trusted_origin_requests WHERE id = ?`, [requestId]);
}

export async function approveHostTrustedOriginRequest(
  db: RegistryDatabase,
  requestId: string,
): Promise<{ host: KhoraHost; request: HostTrustedOriginRequest }> {
  const request = await findOriginRequestById(db, requestId);
  if (request === null) {
    throw new Error("origin request not found");
  }
  if (request.status !== "pending") {
    throw new Error("origin request is not pending");
  }
  const host = await addHostTrustedOrigin(db, request.hostId, request.origin);
  const now = Date.now();
  await db.exec(
    `UPDATE host_trusted_origin_requests
     SET status = 'approved', reviewed_at_ms = ?
     WHERE id = ?`,
    [now, requestId],
  );
  const updated = await findOriginRequestById(db, requestId);
  if (updated === null) {
    throw new Error("origin request approve failed");
  }
  return { host, request: updated };
}

export async function rejectHostTrustedOriginRequest(
  db: RegistryDatabase,
  requestId: string,
): Promise<HostTrustedOriginRequest> {
  const request = await findOriginRequestById(db, requestId);
  if (request === null) {
    throw new Error("origin request not found");
  }
  if (request.status !== "pending") {
    throw new Error("origin request is not pending");
  }
  const now = Date.now();
  await db.exec(
    `UPDATE host_trusted_origin_requests
     SET status = 'rejected', reviewed_at_ms = ?
     WHERE id = ?`,
    [now, requestId],
  );
  const updated = await findOriginRequestById(db, requestId);
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

async function findQuotaRequestById(
  db: RegistryDatabase,
  requestId: string,
): Promise<HostTrustedOriginQuotaRequest | null> {
  const row = await db.queryOne<HostTrustedOriginQuotaRequestRow>(
    `SELECT ${HOST_TRUSTED_ORIGIN_QUOTA_REQUEST_SELECT}
     FROM host_trusted_origin_quota_requests WHERE id = ? LIMIT 1`,
    [requestId],
  );
  return row === undefined ? null : mapQuotaRequest(row);
}

export async function listHostTrustedOriginQuotaRequests(
  db: RegistryDatabase,
  hostId: string,
  status?: HostTrustedOriginQuotaRequest["status"],
): Promise<HostTrustedOriginQuotaRequest[]> {
  const rows =
    status === undefined
      ? await db.queryAll<HostTrustedOriginQuotaRequestRow>(
          `SELECT ${HOST_TRUSTED_ORIGIN_QUOTA_REQUEST_SELECT}
           FROM host_trusted_origin_quota_requests WHERE host_id = ?
           ORDER BY requested_at_ms DESC`,
          [hostId],
        )
      : await db.queryAll<HostTrustedOriginQuotaRequestRow>(
          `SELECT ${HOST_TRUSTED_ORIGIN_QUOTA_REQUEST_SELECT}
           FROM host_trusted_origin_quota_requests WHERE host_id = ? AND status = ?
           ORDER BY requested_at_ms DESC`,
          [hostId, status],
        );
  return rows.map(mapQuotaRequest);
}

export async function findPendingHostTrustedOriginQuotaRequest(
  db: RegistryDatabase,
  hostId: string,
): Promise<HostTrustedOriginQuotaRequest | null> {
  const rows = await listHostTrustedOriginQuotaRequests(db, hostId, "pending");
  return rows[0] ?? null;
}

export async function requestHostTrustedOriginQuota(
  db: RegistryDatabase,
  hostId: string,
  requestedIncluded: number,
): Promise<HostTrustedOriginQuotaRequest> {
  const host = await findHostById(db, hostId);
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
  const existingPending = await findPendingHostTrustedOriginQuotaRequest(db, hostId);
  if (existingPending !== null) {
    throw new Error("quota request is already pending");
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await db.exec(
    `INSERT INTO host_trusted_origin_quota_requests
       (id, host_id, requested_included, status, requested_at_ms)
     VALUES (?, ?, ?, 'pending', ?)`,
    [id, hostId, target, now],
  );
  const created = await findQuotaRequestById(db, id);
  if (created === null) {
    throw new Error("quota request insert failed");
  }
  return created;
}

export async function cancelHostTrustedOriginQuotaRequest(
  db: RegistryDatabase,
  hostId: string,
  requestId: string,
): Promise<void> {
  const request = await findQuotaRequestById(db, requestId);
  if (request === null || request.hostId !== hostId) {
    throw new Error("quota request not found");
  }
  if (request.status !== "pending") {
    throw new Error("only pending quota requests can be cancelled");
  }
  await db.exec(`DELETE FROM host_trusted_origin_quota_requests WHERE id = ?`, [requestId]);
}

export async function approveHostTrustedOriginQuotaRequest(
  db: RegistryDatabase,
  requestId: string,
): Promise<{ host: KhoraHost; request: HostTrustedOriginQuotaRequest }> {
  const request = await findQuotaRequestById(db, requestId);
  if (request === null) {
    throw new Error("quota request not found");
  }
  if (request.status !== "pending") {
    throw new Error("quota request is not pending");
  }
  const host = await setHostIncludedTrustedOrigins(db, request.hostId, request.requestedIncluded);
  const now = Date.now();
  await db.exec(
    `UPDATE host_trusted_origin_quota_requests
     SET status = 'approved', reviewed_at_ms = ?
     WHERE id = ?`,
    [now, requestId],
  );
  const updated = await findQuotaRequestById(db, requestId);
  if (updated === null) {
    throw new Error("quota request approve failed");
  }
  return { host, request: updated };
}

export async function rejectHostTrustedOriginQuotaRequest(
  db: RegistryDatabase,
  requestId: string,
): Promise<HostTrustedOriginQuotaRequest> {
  const request = await findQuotaRequestById(db, requestId);
  if (request === null) {
    throw new Error("quota request not found");
  }
  if (request.status !== "pending") {
    throw new Error("quota request is not pending");
  }
  const now = Date.now();
  await db.exec(
    `UPDATE host_trusted_origin_quota_requests
     SET status = 'rejected', reviewed_at_ms = ?
     WHERE id = ?`,
    [now, requestId],
  );
  const updated = await findQuotaRequestById(db, requestId);
  if (updated === null) {
    throw new Error("quota request reject failed");
  }
  return updated;
}

export async function setHostRegistryParticipation(
  db: RegistryDatabase,
  hostId: string,
  enabled: boolean,
): Promise<KhoraHost> {
  const existing = await findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  if (enabled && existing.status !== "active") {
    throw new Error("only active hosts can participate in the registry");
  }
  await db.exec(`UPDATE khora_hosts SET registry_participation_enabled = ? WHERE id = ?`, [
    enabled ? 1 : 0,
    hostId,
  ]);
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host registry participation update failed");
  }
  return host;
}

export async function setHostIncludedTrustedOrigins(
  db: RegistryDatabase,
  hostId: string,
  included: number,
): Promise<KhoraHost> {
  const existing = await findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  if (!Number.isFinite(included) || included < 0) {
    throw new Error("included trusted origins must be a non-negative number");
  }
  await db.exec(`UPDATE khora_hosts SET included_trusted_origins = ? WHERE id = ?`, [
    Math.floor(included),
    hostId,
  ]);
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host included trusted origins update failed");
  }
  return host;
}

export async function updateHostRegistrySettings(
  db: RegistryDatabase,
  hostId: string,
  params: {
    registryParticipationEnabled?: boolean;
    origins?: string[];
    includedTrustedOrigins?: number;
  },
): Promise<KhoraHost> {
  if (params.includedTrustedOrigins !== undefined) {
    await setHostIncludedTrustedOrigins(db, hostId, params.includedTrustedOrigins);
  }
  if (params.origins !== undefined) {
    await replaceHostTrustedOrigins(db, hostId, params.origins);
  }
  if (params.registryParticipationEnabled !== undefined) {
    return setHostRegistryParticipation(db, hostId, params.registryParticipationEnabled);
  }
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  return host;
}

/** Origins from active participating hosts with at least one trusted origin row. */
export async function listRegistryTrustedOrigins(db: RegistryDatabase): Promise<string[]> {
  const origins: string[] = [];
  for (const host of await listActiveHosts(db)) {
    if (!host.registryParticipationEnabled) {
      continue;
    }
    origins.push(...(await listHostTrustedOriginStrings(db, host.id)));
  }
  return [...new Set(origins)];
}

export async function readHostRegistryState(
  db: RegistryDatabase,
  hostId: string,
): Promise<HostRegistryState | null> {
  const host = await findHostById(db, hostId);
  if (host === null) {
    return null;
  }
  const origins = await listHostTrustedOriginStrings(db, hostId);
  const pendingOriginRequests = await listHostTrustedOriginRequests(db, hostId, "pending");
  const pendingQuotaRequest = await findPendingHostTrustedOriginQuotaRequest(db, hostId);
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
