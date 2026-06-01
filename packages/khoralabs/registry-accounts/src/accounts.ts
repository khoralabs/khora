import type { Database } from "bun:sqlite";
import type { Account } from "@khoralabs/registry-accounts-contracts";
import { normalizeEmail } from "./normalize";
import type { AccountRow } from "./types-internal";

export type BlockedEmailReason = "suspended" | "deleted";
export type BlockedEmail = {
  email: string;
  reason: BlockedEmailReason;
  accountId: string | null;
  blockedAtMs: number;
  updatedAtMs: number;
};

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    status: row.status as Account["status"],
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

function mapBlockedEmail(row: {
  email: string;
  reason: string;
  account_id: string | null;
  blocked_at_ms: number;
  updated_at_ms: number;
}): BlockedEmail {
  return {
    email: row.email,
    reason: row.reason as BlockedEmailReason,
    accountId: row.account_id,
    blockedAtMs: row.blocked_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function findBlockedEmail(db: Database, email: string): BlockedEmail | null {
  const normalized = normalizeEmail(email);
  const row = db
    .prepare(
      `SELECT email, reason, account_id, blocked_at_ms, updated_at_ms
       FROM blocked_emails
       WHERE email = ?
       LIMIT 1`,
    )
    .get(normalized) as {
    email: string;
    reason: string;
    account_id: string | null;
    blocked_at_ms: number;
    updated_at_ms: number;
  } | null;
  return row === null ? null : mapBlockedEmail(row);
}

function blockEmail(
  db: Database,
  input: { email: string; reason: BlockedEmailReason; accountId: string | null; nowMs: number },
): void {
  db.prepare(
    `INSERT INTO blocked_emails (email, reason, account_id, blocked_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       reason = excluded.reason,
       account_id = excluded.account_id,
       updated_at_ms = excluded.updated_at_ms`,
  ).run(input.email, input.reason, input.accountId, input.nowMs, input.nowMs);
}

function blockAccountEmails(
  db: Database,
  input: { accountId: string; reason: BlockedEmailReason; nowMs: number },
): number {
  const emails = listAccountEmails(db, input.accountId);
  for (const email of emails) {
    blockEmail(db, {
      email,
      reason: input.reason,
      accountId: input.accountId,
      nowMs: input.nowMs,
    });
  }
  return emails.length;
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
  params: {
    providerSubject: string;
    email: string;
    verifiedAtMs?: number;
    allowBlockedEmail?: boolean;
  },
): Account {
  const now = Date.now();
  const email = normalizeEmail(params.email);
  const existing = findAccountByAuthSubject(db, params.providerSubject);
  if (existing !== null) {
    if (existing.status !== "active") {
      throw new Error(`account ${existing.status}`);
    }
    mergeEmailOntoAccount(db, {
      accountId: existing.id,
      email,
      verifiedAtMs: params.verifiedAtMs ?? now,
    });
    return existing;
  }

  const byEmail = findAccountByEmail(db, email);
  if (byEmail !== null) {
    if (byEmail.status !== "active") {
      throw new Error(`account ${byEmail.status}`);
    }
    const blocked = findBlockedEmail(db, email);
    if (blocked !== null && blocked.accountId !== byEmail.id && !params.allowBlockedEmail) {
      throw new Error("email blocked");
    }
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

  const blocked = findBlockedEmail(db, email);
  if (blocked !== null && !params.allowBlockedEmail) {
    throw new Error("email blocked");
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
  const blocked = findBlockedEmail(db, email);
  if (blocked !== null && blocked.accountId !== params.accountId) {
    throw new Error("email blocked");
  }
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

export function suspendAccount(db: Database, accountId: string): Account {
  const account = findAccountById(db, accountId);
  if (account === null) throw new Error("account not found");
  const now = Date.now();
  blockAccountEmails(db, { accountId, reason: "suspended", nowMs: now });
  db.prepare(`UPDATE accounts SET status = 'suspended', updated_at_ms = ? WHERE id = ?`).run(
    now,
    accountId,
  );
  const out = findAccountById(db, accountId);
  if (out === null) throw new Error("account not found");
  return out;
}

export function reactivateAccount(db: Database, accountId: string): Account {
  const account = findAccountById(db, accountId);
  if (account === null) throw new Error("account not found");
  const now = Date.now();
  db.prepare(`UPDATE accounts SET status = 'active', updated_at_ms = ? WHERE id = ?`).run(
    now,
    accountId,
  );
  const out = findAccountById(db, accountId);
  if (out === null) throw new Error("account not found");
  return out;
}

export function reactivateAccountByEmail(
  db: Database,
  params: { email: string; providerSubject?: string; verifiedAtMs?: number },
): Account {
  const normalized = normalizeEmail(params.email);
  const blocked = findBlockedEmail(db, normalized);
  if (blocked === null) throw new Error("email not blocked");
  const now = Date.now();
  const existing = findAccountByEmail(db, normalized);
  if (existing !== null) {
    if (existing.status !== "active") {
      db.prepare(`UPDATE accounts SET status = 'active', updated_at_ms = ? WHERE id = ?`).run(
        now,
        existing.id,
      );
    }
    if (params.providerSubject !== undefined && params.providerSubject.length > 0) {
      db.prepare(
        `INSERT OR IGNORE INTO auth_links (account_id, provider, provider_subject, created_at_ms)
         VALUES (?, 'better_auth', ?, ?)`,
      ).run(existing.id, params.providerSubject, now);
    }
    const out = findAccountById(db, existing.id);
    if (out === null) throw new Error("account not found");
    return out;
  }
  const providerSubject = params.providerSubject?.trim();
  if (!providerSubject) {
    throw new Error("provider subject required");
  }
  return linkBetterAuthUser(db, {
    providerSubject,
    email: normalized,
    verifiedAtMs: params.verifiedAtMs,
    allowBlockedEmail: true,
  });
}

export function deleteAccount(
  db: Database,
  accountId: string,
): { accountId: string; blockedEmailsCount: number } {
  const account = findAccountById(db, accountId);
  if (account === null) throw new Error("account not found");
  const now = Date.now();
  const blockedEmailsCount = blockAccountEmails(db, { accountId, reason: "deleted", nowMs: now });
  db.prepare(`DELETE FROM accounts WHERE id = ?`).run(accountId);
  return { accountId, blockedEmailsCount };
}
