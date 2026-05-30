import type { Database } from "bun:sqlite";
import { normalizeHostHealthPath } from "./host-health-path";
import { normalizeHostSlug } from "./host-slug";
import { normalizeKhoraHostBaseUrl } from "./host-url";
import type { HostHealthProbedEndpoint, HostHealthStatus, KhoraHost, KhoraHostRow } from "./types";
import { KHORA_HOST_SELECT } from "./types";

const HOST_COLUMNS = KHORA_HOST_SELECT;

function mapProbedEndpoint(raw: string | null): HostHealthProbedEndpoint | null {
  if (raw === "ready" || raw === "health") {
    return raw;
  }
  return null;
}

function mapHost(row: KhoraHostRow): KhoraHost {
  return {
    id: row.id,
    slug: row.slug,
    baseUrl: row.base_url,
    displayName: row.display_name,
    description: row.description,
    status: row.status as KhoraHost["status"],
    optedInAtMs: row.opted_in_at_ms,
    capabilities:
      row.capabilities === null ? null : (JSON.parse(row.capabilities) as Record<string, unknown>),
    healthReadyPath: row.health_ready_path,
    healthPath: row.health_path,
    healthStatus: row.health_status as HostHealthStatus,
    healthCheckedAtMs: row.health_checked_at_ms,
    healthLatencyMs: row.health_latency_ms,
    healthProbedEndpoint: mapProbedEndpoint(row.health_probed_endpoint),
  };
}

function storageBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  const url = new URL(trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed);
  return url.origin;
}

function findHostByNormalizedBaseUrl(db: Database, baseUrl: string): KhoraHost | null {
  const target = normalizeKhoraHostBaseUrl(baseUrl);
  const rows = db.prepare(`SELECT ${HOST_COLUMNS} FROM khora_hosts`).all() as KhoraHostRow[];
  for (const row of rows) {
    try {
      if (normalizeKhoraHostBaseUrl(row.base_url) === target) {
        return mapHost(row);
      }
    } catch {
      /* skip invalid stored URLs */
    }
  }
  return null;
}

export function findHostBySlug(db: Database, slug: string): KhoraHost | null {
  const row = db
    .prepare(`SELECT ${HOST_COLUMNS} FROM khora_hosts WHERE slug = ? LIMIT 1`)
    .get(normalizeHostSlug(slug)) as KhoraHostRow | null;
  return row === null ? null : mapHost(row);
}

export function findActiveHostBySlug(db: Database, slug: string): KhoraHost | null {
  const host = findHostBySlug(db, slug);
  return host !== null && host.status === "active" ? host : null;
}

export function findPublicHostBySlug(db: Database, slug: string): KhoraHost | null {
  return findActiveHostBySlug(db, slug);
}

export function findHostById(db: Database, hostId: string): KhoraHost | null {
  const row = db
    .prepare(`SELECT ${HOST_COLUMNS} FROM khora_hosts WHERE id = ? LIMIT 1`)
    .get(hostId) as KhoraHostRow | null;
  return row === null ? null : mapHost(row);
}

export function listAllHosts(db: Database): KhoraHost[] {
  const rows = db
    .prepare(`SELECT ${HOST_COLUMNS} FROM khora_hosts ORDER BY slug ASC`)
    .all() as KhoraHostRow[];
  return rows.map(mapHost);
}

export function listActiveHosts(db: Database): KhoraHost[] {
  const rows = db
    .prepare(`SELECT ${HOST_COLUMNS} FROM khora_hosts WHERE status = 'active' ORDER BY slug ASC`)
    .all() as KhoraHostRow[];
  return rows.map(mapHost);
}

export function listPublicHosts(db: Database): KhoraHost[] {
  return listActiveHosts(db);
}

export function registerKhoraHost(
  db: Database,
  params: {
    slug: string;
    baseUrl: string;
    displayName?: string;
    description?: string;
    capabilities?: Record<string, unknown>;
    healthReadyPath?: string;
    healthPath?: string;
  },
): KhoraHost {
  const slug = normalizeHostSlug(params.slug);
  const baseUrl = storageBaseUrl(params.baseUrl);
  normalizeKhoraHostBaseUrl(baseUrl);
  const healthReadyPath = normalizeHostHealthPath(params.healthReadyPath ?? "/ready");
  const healthPath = normalizeHostHealthPath(params.healthPath ?? "/health");

  if (findHostBySlug(db, slug) !== null) {
    throw new Error(`host slug already registered: ${slug}`);
  }
  if (findHostByNormalizedBaseUrl(db, baseUrl) !== null) {
    throw new Error(`host base URL already registered: ${baseUrl}`);
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO khora_hosts (
       id, slug, base_url, display_name, description, status, opted_in_at_ms, capabilities,
       health_ready_path, health_path
     ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
  ).run(
    id,
    slug,
    baseUrl,
    params.displayName?.trim() || null,
    params.description?.trim() || null,
    now,
    params.capabilities === undefined ? null : JSON.stringify(params.capabilities),
    healthReadyPath,
    healthPath,
  );
  const host = findHostById(db, id);
  if (host === null) {
    throw new Error("khora host insert failed");
  }
  return host;
}

export function updateHostHealthCheck(
  db: Database,
  hostId: string,
  params: {
    status: HostHealthStatus;
    checkedAtMs: number;
    latencyMs: number | null;
    probedEndpoint: HostHealthProbedEndpoint | null;
  },
): KhoraHost {
  const existing = findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  db.prepare(
    `UPDATE khora_hosts SET
       health_status = ?,
       health_checked_at_ms = ?,
       health_latency_ms = ?,
       health_probed_endpoint = ?
     WHERE id = ?`,
  ).run(params.status, params.checkedAtMs, params.latencyMs, params.probedEndpoint, hostId);
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host health update failed");
  }
  return host;
}

export function activateKhoraHost(db: Database, hostId: string): KhoraHost {
  const existing = findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  if (existing.status === "active") {
    return existing;
  }
  if (existing.status !== "pending") {
    throw new Error(`cannot activate host in status: ${existing.status}`);
  }
  db.prepare(`UPDATE khora_hosts SET status = 'active' WHERE id = ?`).run(hostId);
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host activate failed");
  }
  return host;
}

export function suspendKhoraHost(db: Database, hostId: string): KhoraHost {
  const existing = findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  db.prepare(`UPDATE khora_hosts SET status = 'suspended' WHERE id = ?`).run(hostId);
  const host = findHostById(db, hostId);
  if (host === null) {
    throw new Error("host suspend failed");
  }
  return host;
}

/** Dev bootstrap: insert or return existing host as active. */
export function seedDefaultHost(
  db: Database,
  params: {
    slug: string;
    baseUrl: string;
    capabilities?: Record<string, unknown>;
    healthReadyPath?: string;
    healthPath?: string;
  },
): KhoraHost {
  const slug = normalizeHostSlug(params.slug);
  const existing = findHostBySlug(db, slug);
  if (existing !== null) {
    if (existing.status !== "active") {
      return activateKhoraHost(db, existing.id);
    }
    return existing;
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const baseUrl = storageBaseUrl(params.baseUrl);
  const healthReadyPath = normalizeHostHealthPath(params.healthReadyPath ?? "/ready");
  const healthPath = normalizeHostHealthPath(params.healthPath ?? "/health");
  db.prepare(
    `INSERT INTO khora_hosts (
       id, slug, base_url, status, opted_in_at_ms, capabilities,
       health_ready_path, health_path
     ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
  ).run(
    id,
    slug,
    baseUrl,
    now,
    params.capabilities === undefined ? null : JSON.stringify(params.capabilities),
    healthReadyPath,
    healthPath,
  );
  const host = findHostById(db, id);
  if (host === null) {
    throw new Error("khora host insert failed");
  }
  return host;
}

export function countHosts(db: Database): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM khora_hosts`).get() as { n: number };
  return row.n;
}
