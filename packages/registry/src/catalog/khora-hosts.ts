import type {
  HostHealthProbedEndpoint,
  HostHealthStatus,
  KhoraHost,
} from "@khoralabs/khora-registry/contracts";
import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";
import { normalizeHostHealthPath } from "./host-health-path";
import { issueHostManagementToken } from "./host-management-token";
import {
  parseRegistrationRequirements,
  type RegistrationRequirementState,
  serializeRegistrationRequirements,
} from "./host-registration-requirements";
import {
  issueHostRegistrationSecret,
  storePendingManagementToken,
  takePendingManagementToken,
} from "./host-registration-secret";
import { normalizeHostSlug } from "./host-slug";
import { normalizeKhoraHostBaseUrl } from "./host-url";
import type { KhoraHostRow } from "./types-internal";
import { KHORA_HOST_SELECT } from "./types-internal";

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
    registryParticipationEnabled: row.registry_participation_enabled !== 0,
    includedTrustedOrigins: row.included_trusted_origins,
    registrationRequirements: parseRegistrationRequirements(row.registration_requirements),
  };
}

function storageBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  const url = new URL(trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed);
  return url.origin;
}

async function findHostByNormalizedBaseUrl(
  db: RegistryDatabase,
  baseUrl: string,
): Promise<KhoraHost | null> {
  const target = normalizeKhoraHostBaseUrl(baseUrl);
  const rows = await db.queryAll<KhoraHostRow>(`SELECT ${HOST_COLUMNS} FROM khora_hosts`);
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

export async function findHostBySlug(
  db: RegistryDatabase,
  slug: string,
): Promise<KhoraHost | null> {
  const row = await db.queryOne<KhoraHostRow>(
    `SELECT ${HOST_COLUMNS} FROM khora_hosts WHERE slug = ? LIMIT 1`,
    [normalizeHostSlug(slug)],
  );
  return row === undefined ? null : mapHost(row);
}

export async function findActiveHostBySlug(
  db: RegistryDatabase,
  slug: string,
): Promise<KhoraHost | null> {
  const host = await findHostBySlug(db, slug);
  return host !== null && host.status === "active" ? host : null;
}

export async function findPublicHostBySlug(
  db: RegistryDatabase,
  slug: string,
): Promise<KhoraHost | null> {
  return await findActiveHostBySlug(db, slug);
}

export async function findHostById(
  db: RegistryDatabase,
  hostId: string,
): Promise<KhoraHost | null> {
  const row = await db.queryOne<KhoraHostRow>(
    `SELECT ${HOST_COLUMNS} FROM khora_hosts WHERE id = ? LIMIT 1`,
    [hostId],
  );
  return row === undefined ? null : mapHost(row);
}

export async function listAllHosts(db: RegistryDatabase): Promise<KhoraHost[]> {
  const rows = await db.queryAll<KhoraHostRow>(
    `SELECT ${HOST_COLUMNS} FROM khora_hosts ORDER BY slug ASC`,
  );
  return rows.map(mapHost);
}

export async function listActiveHosts(db: RegistryDatabase): Promise<KhoraHost[]> {
  const rows = await db.queryAll<KhoraHostRow>(
    `SELECT ${HOST_COLUMNS} FROM khora_hosts WHERE status = 'active' ORDER BY slug ASC`,
  );
  return rows.map(mapHost);
}

/** Hosts probed by the registry health poller (active and pending). */
export async function listHostsForHealthPoll(db: RegistryDatabase): Promise<KhoraHost[]> {
  return (await listAllHosts(db)).filter(
    (host) => host.status === "active" || host.status === "pending",
  );
}

export async function listPublicHosts(db: RegistryDatabase): Promise<KhoraHost[]> {
  return await listActiveHosts(db);
}

export async function saveHostRegistrationRequirements(
  db: RegistryDatabase,
  hostId: string,
  requirements: RegistrationRequirementState[],
): Promise<KhoraHost> {
  const existing = await findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  await db.exec(`UPDATE khora_hosts SET registration_requirements = ? WHERE id = ?`, [
    serializeRegistrationRequirements(requirements),
    hostId,
  ]);
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host registration requirements update failed");
  }
  return host;
}

export async function registerKhoraHost(
  db: RegistryDatabase,
  params: {
    slug: string;
    baseUrl: string;
    displayName?: string;
    description?: string;
    capabilities?: Record<string, unknown>;
    healthReadyPath?: string;
    healthPath?: string;
    registrationRequirements?: RegistrationRequirementState[];
  },
): Promise<{ host: KhoraHost; registrationSecret: string }> {
  const slug = normalizeHostSlug(params.slug);
  const baseUrl = storageBaseUrl(params.baseUrl);
  normalizeKhoraHostBaseUrl(baseUrl);
  const healthReadyPath = normalizeHostHealthPath(params.healthReadyPath ?? "/ready");
  const healthPath = normalizeHostHealthPath(params.healthPath ?? "/health");

  if ((await findHostBySlug(db, slug)) !== null) {
    throw new Error(`host slug already registered: ${slug}`);
  }
  if ((await findHostByNormalizedBaseUrl(db, baseUrl)) !== null) {
    throw new Error(`host base URL already registered: ${baseUrl}`);
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const requirementsJson =
    params.registrationRequirements !== undefined
      ? serializeRegistrationRequirements(params.registrationRequirements)
      : null;
  await db.exec(
    `INSERT INTO khora_hosts (
       id, slug, base_url, display_name, description, status, opted_in_at_ms, capabilities,
       health_ready_path, health_path, registration_requirements
     ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      id,
      slug,
      baseUrl,
      params.displayName?.trim() || null,
      params.description?.trim() || null,
      now,
      params.capabilities === undefined ? null : JSON.stringify(params.capabilities),
      healthReadyPath,
      healthPath,
      requirementsJson,
    ],
  );
  const registrationSecret = await issueHostRegistrationSecret(db, id);
  const host = await findHostById(db, id);
  if (host === null) {
    throw new Error("khora host insert failed");
  }
  return { host, registrationSecret };
}

export async function updateHostHealthCheck(
  db: RegistryDatabase,
  hostId: string,
  params: {
    status: HostHealthStatus;
    checkedAtMs: number;
    latencyMs: number | null;
    probedEndpoint: HostHealthProbedEndpoint | null;
  },
): Promise<KhoraHost> {
  const existing = await findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  await db.exec(
    `UPDATE khora_hosts SET
       health_status = ?,
       health_checked_at_ms = ?,
       health_latency_ms = ?,
       health_probed_endpoint = ?
     WHERE id = ?`,
    [params.status, params.checkedAtMs, params.latencyMs, params.probedEndpoint, hostId],
  );
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host health update failed");
  }
  return host;
}

export async function activateKhoraHost(
  db: RegistryDatabase,
  hostId: string,
  options?: { satisfyOperatorApproval?: boolean },
): Promise<{ host: KhoraHost; managementToken: string | null }> {
  const existing = await findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  if (existing.status === "active") {
    return { host: existing, managementToken: null };
  }
  if (existing.status !== "pending") {
    throw new Error(`cannot activate host in status: ${existing.status}`);
  }

  let requirements = existing.registrationRequirements;
  if (options?.satisfyOperatorApproval === true) {
    requirements = requirements.map((item) =>
      item.id === "operator_approval"
        ? { ...item, status: "satisfied" as const, checkedAtMs: Date.now() }
        : item,
    );
    await saveHostRegistrationRequirements(db, hostId, requirements);
  }

  await db.exec(`UPDATE khora_hosts SET status = 'active' WHERE id = ?`, [hostId]);
  const managementToken = await issueHostManagementToken(db, hostId);
  if (managementToken !== null) {
    await storePendingManagementToken(db, hostId, managementToken);
  }
  // Keep registration_secret_hash until deliverPendingManagementToken / claim
  // so only the registration-secret holder can receive the management token.
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host activate failed");
  }
  return { host, managementToken };
}

export async function deliverPendingManagementToken(
  db: RegistryDatabase,
  hostId: string,
): Promise<string | null> {
  return takePendingManagementToken(db, hostId);
}

export async function suspendKhoraHost(db: RegistryDatabase, hostId: string): Promise<KhoraHost> {
  const existing = await findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  if (existing.status === "suspended") {
    return existing;
  }
  await db.exec(`UPDATE khora_hosts SET status = 'suspended' WHERE id = ?`, [hostId]);
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host suspend failed");
  }
  return host;
}

export async function reactivateKhoraHost(
  db: RegistryDatabase,
  hostId: string,
): Promise<KhoraHost> {
  const existing = await findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  if (existing.status !== "suspended") {
    throw new Error(`cannot reactivate host in status: ${existing.status}`);
  }
  await db.exec(`UPDATE khora_hosts SET status = 'active' WHERE id = ?`, [hostId]);
  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host reactivate failed");
  }
  return host;
}

export type DeletedKhoraHostRef = { slug: string; baseUrl: string };

export async function deleteKhoraHost(
  db: RegistryDatabase,
  hostId: string,
): Promise<DeletedKhoraHostRef> {
  const existing = await findHostById(db, hostId);
  if (existing === null) {
    throw new Error("host not found");
  }
  const ref = { slug: existing.slug, baseUrl: existing.baseUrl };
  await db.exec(
    `UPDATE agent_account_bindings SET bound_via_host_id = NULL WHERE bound_via_host_id = ?`,
    [hostId],
  );
  await db.exec(`DELETE FROM khora_hosts WHERE id = ?`, [hostId]);
  return ref;
}

/** Dev bootstrap: insert or return existing host as active. */
export async function seedDefaultHost(
  db: RegistryDatabase,
  params: {
    slug: string;
    baseUrl: string;
    capabilities?: Record<string, unknown>;
    healthReadyPath?: string;
    healthPath?: string;
  },
): Promise<KhoraHost> {
  const slug = normalizeHostSlug(params.slug);
  const existing = await findHostBySlug(db, slug);
  if (existing !== null) {
    if (existing.status !== "active") {
      const activated = await activateKhoraHost(db, existing.id);
      return activated.host;
    }
    return existing;
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const baseUrl = storageBaseUrl(params.baseUrl);
  const healthReadyPath = normalizeHostHealthPath(params.healthReadyPath ?? "/ready");
  const healthPath = normalizeHostHealthPath(params.healthPath ?? "/health");
  await db.exec(
    `INSERT INTO khora_hosts (
       id, slug, base_url, status, opted_in_at_ms, capabilities,
       health_ready_path, health_path
     ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
    [
      id,
      slug,
      baseUrl,
      now,
      params.capabilities === undefined ? null : JSON.stringify(params.capabilities),
      healthReadyPath,
      healthPath,
    ],
  );
  const host = await findHostById(db, id);
  if (host === null) {
    throw new Error("khora host insert failed");
  }
  return host;
}

export async function countHosts(db: RegistryDatabase): Promise<number> {
  const row = await db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM khora_hosts`);
  return row?.n ?? 0;
}
