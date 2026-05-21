import type { Database } from "bun:sqlite";
import type { AtriumHost } from "./types";

type HostRow = {
  id: string;
  slug: string;
  base_url: string;
  status: string;
  opted_in_at_ms: number | null;
  capabilities: string | null;
};

function mapHost(row: HostRow): AtriumHost {
  return {
    id: row.id,
    slug: row.slug,
    baseUrl: row.base_url,
    status: row.status as AtriumHost["status"],
    optedInAtMs: row.opted_in_at_ms,
    capabilities:
      row.capabilities === null ? null : (JSON.parse(row.capabilities) as Record<string, unknown>),
  };
}

export function findHostBySlug(db: Database, slug: string): AtriumHost | null {
  const row = db
    .prepare(
      `SELECT id, slug, base_url, status, opted_in_at_ms, capabilities
       FROM atrium_hosts WHERE slug = ? LIMIT 1`,
    )
    .get(slug.trim()) as HostRow | null;
  return row === null ? null : mapHost(row);
}

export function findHostById(db: Database, hostId: string): AtriumHost | null {
  const row = db
    .prepare(
      `SELECT id, slug, base_url, status, opted_in_at_ms, capabilities
       FROM atrium_hosts WHERE id = ? LIMIT 1`,
    )
    .get(hostId) as HostRow | null;
  return row === null ? null : mapHost(row);
}

export function listActiveHosts(db: Database): AtriumHost[] {
  const rows = db
    .prepare(
      `SELECT id, slug, base_url, status, opted_in_at_ms, capabilities
       FROM atrium_hosts WHERE status = 'active' ORDER BY slug ASC`,
    )
    .all() as HostRow[];
  return rows.map(mapHost);
}

export function seedDefaultHost(
  db: Database,
  params: { slug: string; baseUrl: string; capabilities?: Record<string, unknown> },
): AtriumHost {
  const existing = findHostBySlug(db, params.slug);
  if (existing !== null) return existing;

  const now = Date.now();
  const id = crypto.randomUUID();
  const baseUrl = params.baseUrl.replace(/\/$/, "");
  db.prepare(
    `INSERT INTO atrium_hosts (id, slug, base_url, status, opted_in_at_ms, capabilities)
     VALUES (?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    params.slug,
    baseUrl,
    now,
    params.capabilities === undefined ? null : JSON.stringify(params.capabilities),
  );
  return findHostById(db, id)!;
}

export function countHosts(db: Database): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM atrium_hosts`).get() as { n: number };
  return row.n;
}
