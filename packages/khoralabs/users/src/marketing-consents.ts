import type { Database } from "bun:sqlite";
import { normalizeEmail } from "./normalize";
import type { MarketingConsent } from "./types";

type ConsentRow = {
  id: string;
  email: string;
  account_id: string | null;
  list_slug: string;
  opted_in_at_ms: number;
  opted_out_at_ms: number | null;
  source_app: string | null;
};

function mapConsent(row: ConsentRow): MarketingConsent {
  return {
    id: row.id,
    email: row.email,
    accountId: row.account_id,
    listSlug: row.list_slug,
    optedInAtMs: row.opted_in_at_ms,
    optedOutAtMs: row.opted_out_at_ms,
    sourceApp: row.source_app,
  };
}

export function findMarketingConsent(
  db: Database,
  email: string,
  listSlug: string,
): MarketingConsent | null {
  const row = db
    .prepare(
      `SELECT id, email, account_id, list_slug, opted_in_at_ms, opted_out_at_ms, source_app
       FROM marketing_consents WHERE email = ? AND list_slug = ? LIMIT 1`,
    )
    .get(normalizeEmail(email), listSlug) as ConsentRow | null;
  return row === null ? null : mapConsent(row);
}

export function subscribeMarketing(
  db: Database,
  params: { email: string; listSlug: string; sourceApp?: string; accountId?: string },
): MarketingConsent {
  const email = normalizeEmail(params.email);
  const existing = findMarketingConsent(db, email, params.listSlug);
  const now = Date.now();
  if (existing !== null) {
    db.prepare(
      `UPDATE marketing_consents
       SET opted_in_at_ms = ?, opted_out_at_ms = NULL, source_app = COALESCE(?, source_app),
           account_id = COALESCE(?, account_id)
       WHERE id = ?`,
    ).run(now, params.sourceApp ?? null, params.accountId ?? null, existing.id);
    return findMarketingConsent(db, email, params.listSlug)!;
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO marketing_consents
       (id, email, account_id, list_slug, opted_in_at_ms, source_app)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, email, params.accountId ?? null, params.listSlug, now, params.sourceApp ?? null);
  return findMarketingConsent(db, email, params.listSlug)!;
}

export function unsubscribeMarketing(
  db: Database,
  params: { email: string; listSlug: string },
): MarketingConsent | null {
  const email = normalizeEmail(params.email);
  const existing = findMarketingConsent(db, email, params.listSlug);
  if (existing === null) return null;
  const now = Date.now();
  db.prepare(`UPDATE marketing_consents SET opted_out_at_ms = ? WHERE id = ?`).run(
    now,
    existing.id,
  );
  return findMarketingConsent(db, email, params.listSlug);
}

export function listMarketingConsentsForAccount(
  db: Database,
  accountId: string,
): MarketingConsent[] {
  const rows = db
    .prepare(
      `SELECT id, email, account_id, list_slug, opted_in_at_ms, opted_out_at_ms, source_app
       FROM marketing_consents WHERE account_id = ? ORDER BY opted_in_at_ms DESC`,
    )
    .all(accountId) as ConsentRow[];
  return rows.map(mapConsent);
}

export function listActiveMarketingConsentsForEmail(
  db: Database,
  email: string,
): MarketingConsent[] {
  const rows = db
    .prepare(
      `SELECT id, email, account_id, list_slug, opted_in_at_ms, opted_out_at_ms, source_app
       FROM marketing_consents
       WHERE email = ? AND opted_out_at_ms IS NULL
       ORDER BY opted_in_at_ms DESC`,
    )
    .all(normalizeEmail(email)) as ConsentRow[];
  return rows.map(mapConsent);
}
