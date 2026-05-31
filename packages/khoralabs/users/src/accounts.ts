import type { Database } from "bun:sqlite";
import { normalizeEmail } from "./normalize";
import type { Account, AccountRow } from "./types";

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    status: row.status as Account["status"],
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function findAccountByAuthSubject(db: Database, providerSubject: string): Account | null {
  const row = db
    .prepare(
      `SELECT a.id, a.status, a.created_at_ms, a.updated_at_ms
       FROM accounts a
       JOIN auth_links l ON l.account_id = a.id
       WHERE l.provider = 'better_auth' AND l.provider_subject = ?
       LIMIT 1`,
    )
    .get(providerSubject) as AccountRow | null;
  return row === null ? null : mapAccount(row);
}

export function findAccountById(db: Database, accountId: string): Account | null {
  const row = db
    .prepare(`SELECT id, status, created_at_ms, updated_at_ms FROM accounts WHERE id = ? LIMIT 1`)
    .get(accountId) as AccountRow | null;
  return row === null ? null : mapAccount(row);
}

export function findAccountByEmail(db: Database, email: string): Account | null {
  const normalized = normalizeEmail(email);
  const row = db
    .prepare(
      `SELECT a.id, a.status, a.created_at_ms, a.updated_at_ms
       FROM accounts a
       JOIN account_emails e ON e.account_id = a.id
       WHERE e.email = ?
       LIMIT 1`,
    )
    .get(normalized) as AccountRow | null;
  return row === null ? null : mapAccount(row);
}

export function linkBetterAuthUser(
  db: Database,
  params: { providerSubject: string; email: string; verifiedAtMs?: number },
): Account {
  const now = Date.now();
  const email = normalizeEmail(params.email);
  const existing = findAccountByAuthSubject(db, params.providerSubject);
  if (existing !== null) {
    mergeEmailOntoAccount(db, {
      accountId: existing.id,
      email,
      verifiedAtMs: params.verifiedAtMs ?? now,
    });
    return existing;
  }

  const byEmail = findAccountByEmail(db, email);
  if (byEmail !== null) {
    db.prepare(
      `INSERT OR IGNORE INTO auth_links (account_id, provider, provider_subject, created_at_ms)
       VALUES (?, 'better_auth', ?, ?)`,
    ).run(byEmail.id, params.providerSubject, now);
    mergeEmailOntoAccount(db, {
      accountId: byEmail.id,
      email,
      verifiedAtMs: params.verifiedAtMs ?? now,
    });
    return byEmail;
  }

  const accountId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO accounts (id, status, created_at_ms, updated_at_ms) VALUES (?, 'active', ?, ?)`,
  ).run(accountId, now, now);
  db.prepare(
    `INSERT INTO account_emails (account_id, email, is_primary, verified_at_ms)
     VALUES (?, ?, 1, ?)`,
  ).run(accountId, email, params.verifiedAtMs ?? now);
  db.prepare(
    `INSERT INTO auth_links (account_id, provider, provider_subject, created_at_ms)
     VALUES (?, 'better_auth', ?, ?)`,
  ).run(accountId, params.providerSubject, now);
  mergePreAccountRecords(db, accountId, email);
  const account = findAccountByAuthSubject(db, params.providerSubject);
  if (account === null) {
    throw new Error("account insert failed");
  }
  return account;
}

export function mergeEmailOntoAccount(
  db: Database,
  params: { accountId: string; email: string; verifiedAtMs?: number },
): void {
  const now = Date.now();
  const email = normalizeEmail(params.email);
  db.prepare(
    `INSERT OR IGNORE INTO account_emails (account_id, email, is_primary, verified_at_ms)
     VALUES (?, ?, 0, ?)`,
  ).run(params.accountId, email, params.verifiedAtMs ?? now);
  mergePreAccountRecords(db, params.accountId, email);
  db.prepare(`UPDATE accounts SET updated_at_ms = ? WHERE id = ?`).run(now, params.accountId);
}

function mergePreAccountRecords(db: Database, accountId: string, email: string): void {
  db.prepare(
    `UPDATE marketing_consents SET account_id = ? WHERE email = ? AND account_id IS NULL`,
  ).run(accountId, email);
}

export function listAccountEmails(db: Database, accountId: string): string[] {
  const rows = db
    .prepare(
      `SELECT email FROM account_emails WHERE account_id = ? ORDER BY is_primary DESC, email ASC`,
    )
    .all(accountId) as { email: string }[];
  return rows.map((r) => r.email);
}
