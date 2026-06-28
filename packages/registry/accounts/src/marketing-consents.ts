import type { MarketingConsent } from "@khoralabs/registry-accounts-contracts";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";
import { normalizeEmail } from "./normalize";
import type { MarketingConsentRow } from "./types-internal";

function mapConsent(row: MarketingConsentRow): MarketingConsent {
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

export async function findMarketingConsent(
  db: RegistryDatabase,
  email: string,
  listSlug: string,
): Promise<MarketingConsent | null> {
  const row = await db.queryOne<MarketingConsentRow>(
    `SELECT id, email, account_id, list_slug, opted_in_at_ms, opted_out_at_ms, source_app
     FROM marketing_consents WHERE email = ? AND list_slug = ? LIMIT 1`,
    [normalizeEmail(email), listSlug],
  );
  return row === undefined ? null : mapConsent(row);
}

export async function subscribeMarketing(
  db: RegistryDatabase,
  params: { email: string; listSlug: string; sourceApp?: string; accountId?: string },
): Promise<MarketingConsent> {
  const email = normalizeEmail(params.email);
  const existing = await findMarketingConsent(db, email, params.listSlug);
  const now = Date.now();
  if (existing !== null) {
    await db.exec(
      `UPDATE marketing_consents
       SET opted_in_at_ms = ?, opted_out_at_ms = NULL, source_app = COALESCE(?, source_app),
           account_id = COALESCE(?, account_id)
       WHERE id = ?`,
      [now, params.sourceApp ?? null, params.accountId ?? null, existing.id],
    );
    const consent = await findMarketingConsent(db, email, params.listSlug);
    if (consent === null) {
      throw new Error("marketing consent update failed");
    }
    return consent;
  }

  const id = crypto.randomUUID();
  await db.exec(
    `INSERT INTO marketing_consents
       (id, email, account_id, list_slug, opted_in_at_ms, source_app)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, email, params.accountId ?? null, params.listSlug, now, params.sourceApp ?? null],
  );
  const consent = await findMarketingConsent(db, email, params.listSlug);
  if (consent === null) {
    throw new Error("marketing consent insert failed");
  }
  return consent;
}

export async function unsubscribeMarketing(
  db: RegistryDatabase,
  params: { email: string; listSlug: string },
): Promise<MarketingConsent | null> {
  const email = normalizeEmail(params.email);
  const existing = await findMarketingConsent(db, email, params.listSlug);
  if (existing === null) return null;
  const now = Date.now();
  await db.exec(`UPDATE marketing_consents SET opted_out_at_ms = ? WHERE id = ?`, [
    now,
    existing.id,
  ]);
  return findMarketingConsent(db, email, params.listSlug);
}

export async function listMarketingConsentsForAccount(
  db: RegistryDatabase,
  accountId: string,
): Promise<MarketingConsent[]> {
  const rows = await db.queryAll<MarketingConsentRow>(
    `SELECT id, email, account_id, list_slug, opted_in_at_ms, opted_out_at_ms, source_app
     FROM marketing_consents WHERE account_id = ? ORDER BY opted_in_at_ms DESC`,
    [accountId],
  );
  return rows.map(mapConsent);
}

export async function listMarketingConsentsForEmail(
  db: RegistryDatabase,
  email: string,
): Promise<MarketingConsent[]> {
  const rows = await db.queryAll<MarketingConsentRow>(
    `SELECT id, email, account_id, list_slug, opted_in_at_ms, opted_out_at_ms, source_app
     FROM marketing_consents WHERE email = ? ORDER BY opted_in_at_ms DESC`,
    [normalizeEmail(email)],
  );
  return rows.map(mapConsent);
}

export async function listActiveMarketingConsentsForEmail(
  db: RegistryDatabase,
  email: string,
): Promise<MarketingConsent[]> {
  const rows = await db.queryAll<MarketingConsentRow>(
    `SELECT id, email, account_id, list_slug, opted_in_at_ms, opted_out_at_ms, source_app
     FROM marketing_consents
     WHERE email = ? AND opted_out_at_ms IS NULL
     ORDER BY opted_in_at_ms DESC`,
    [normalizeEmail(email)],
  );
  return rows.map(mapConsent);
}
