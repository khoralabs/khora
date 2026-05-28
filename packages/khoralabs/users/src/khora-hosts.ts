import type { Database } from "bun:sqlite";
import type { KhoraHost } from "./types";

type HostRow = {
  id: string;
  slug: string;
  base_url: string;
  status: string;
  opted_in_at_ms: number | null;
  capabilities: string | null;
};

function mapHost(row: HostRow): KhoraHost {
  return {
    id: row.id,
    slug: row.slug,
    baseUrl: row.base_url,
    status: row.status as KhoraHost["status"],
    optedInAtMs: row.opted_in_at_ms,
    capabilities:
      row.capabilities === null ? null : (JSON.parse(row.capabilities) as Record<string, unknown>),
  };
}

export function findHostBySlug(db: Database, slug: string): KhoraHost | null {
  const row = db
    .prepare(
      `SELECT id, slug, base_url, status, opted_in_at_ms, capabilities
       FROM khora_hosts WHERE slug = ? LIMIT 1`,
    )
    .get(slug.trim()) as HostRow | null;
  return row === null ? null : mapHost(row);
}

export function findHostById(db: Database, hostId: string): KhoraHost | null {
  const row = db
    .prepare(
      `SELECT id, slug, base_url, status, opted_in_at_ms, capabilities
       FROM khora_hosts WHERE id = ? LIMIT 1`,
    )
    .get(hostId) as HostRow | null;
  return row === null ? null : mapHost(row);
}

export function listAllHosts(db: Database): KhoraHost[] {
  const rows = db
    .prepare(
      `SELECT id, slug, base_url, status, opted_in_at_ms, capabilities
       FROM khora_hosts ORDER BY slug ASC`,
    )
    .all() as HostRow[];
  return rows.map(mapHost);
}

export function listActiveHosts(db: Database): KhoraHost[] {
  const rows = db
    .prepare(
      `SELECT id, slug, base_url, status, opted_in_at_ms, capabilities
       FROM khora_hosts WHERE status = 'active' ORDER BY slug ASC`,
    )
    .all() as HostRow[];
  return rows.map(mapHost);
}

export function seedDefaultHost(
  db: Database,
  params: { slug: string; baseUrl: string; capabilities?: Record<string, unknown> },
): KhoraHost {
  const existing = findHostBySlug(db, params.slug);
  if (existing !== null) return existing;

  const now = Date.now();
  const id = crypto.randomUUID();
  const baseUrl = params.baseUrl.replace(/\/$/, "");
  db.prepare(
    `INSERT INTO khora_hosts (id, slug, base_url, status, opted_in_at_ms, capabilities)
     VALUES (?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    params.slug,
    baseUrl,
    now,
    params.capabilities === undefined ? null : JSON.stringify(params.capabilities),
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
