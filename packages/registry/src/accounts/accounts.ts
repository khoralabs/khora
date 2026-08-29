import type { Account } from "@khoralabs/registry/contracts";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
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

export async function findBlockedEmail(
  db: RegistryDatabase,
  email: string,
): Promise<BlockedEmail | null> {
  const normalized = normalizeEmail(email);
  const row = await db.queryOne<{
    email: string;
    reason: string;
    account_id: string | null;
    blocked_at_ms: number;
    updated_at_ms: number;
  }>(
    `SELECT email, reason, account_id, blocked_at_ms, updated_at_ms
     FROM blocked_emails
     WHERE email = ?
     LIMIT 1`,
    [normalized],
  );
  return row === undefined ? null : mapBlockedEmail(row);
}

async function blockEmail(
  db: RegistryDatabase,
  input: { email: string; reason: BlockedEmailReason; accountId: string | null; nowMs: number },
): Promise<void> {
  await db.exec(
    `INSERT INTO blocked_emails (email, reason, account_id, blocked_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       reason = excluded.reason,
       account_id = excluded.account_id,
       updated_at_ms = excluded.updated_at_ms`,
    [input.email, input.reason, input.accountId, input.nowMs, input.nowMs],
  );
}

async function blockAccountEmails(
  db: RegistryDatabase,
  input: { accountId: string; reason: BlockedEmailReason; nowMs: number },
): Promise<number> {
  const emails = await listAccountEmails(db, input.accountId);
  for (const email of emails) {
    await blockEmail(db, {
      email,
      reason: input.reason,
      accountId: input.accountId,
      nowMs: input.nowMs,
    });
  }
  return emails.length;
}

export async function findAccountByAuthSubject(
  db: RegistryDatabase,
  providerSubject: string,
): Promise<Account | null> {
  const row = await db.queryOne<AccountRow>(
    `SELECT a.id, a.status, a.created_at_ms, a.updated_at_ms
     FROM accounts a
     JOIN auth_links l ON l.account_id = a.id
     WHERE l.provider = 'better_auth' AND l.provider_subject = ?
     LIMIT 1`,
    [providerSubject],
  );
  return row === undefined ? null : mapAccount(row);
}

export async function findAccountById(
  db: RegistryDatabase,
  accountId: string,
): Promise<Account | null> {
  const row = await db.queryOne<AccountRow>(
    `SELECT id, status, created_at_ms, updated_at_ms FROM accounts WHERE id = ? LIMIT 1`,
    [accountId],
  );
  return row === undefined ? null : mapAccount(row);
}

export async function findAccountByEmail(
  db: RegistryDatabase,
  email: string,
): Promise<Account | null> {
  const normalized = normalizeEmail(email);
  const row = await db.queryOne<AccountRow>(
    `SELECT a.id, a.status, a.created_at_ms, a.updated_at_ms
     FROM accounts a
     JOIN account_emails e ON e.account_id = a.id
     WHERE e.email = ?
     LIMIT 1`,
    [normalized],
  );
  return row === undefined ? null : mapAccount(row);
}

export async function linkBetterAuthUser(
  db: RegistryDatabase,
  params: {
    providerSubject: string;
    email: string;
    verifiedAtMs?: number;
    allowBlockedEmail?: boolean;
  },
): Promise<Account> {
  const now = Date.now();
  const email = normalizeEmail(params.email);
  const existing = await findAccountByAuthSubject(db, params.providerSubject);
  if (existing !== null) {
    if (existing.status !== "active") {
      throw new Error(`account ${existing.status}`);
    }
    await mergeEmailOntoAccount(db, {
      accountId: existing.id,
      email,
      verifiedAtMs: params.verifiedAtMs ?? now,
    });
    return existing;
  }

  const byEmail = await findAccountByEmail(db, email);
  if (byEmail !== null) {
    if (byEmail.status !== "active") {
      throw new Error(`account ${byEmail.status}`);
    }
    const blocked = await findBlockedEmail(db, email);
    if (blocked !== null && blocked.accountId !== byEmail.id && !params.allowBlockedEmail) {
      throw new Error("email blocked");
    }
    await db.exec(
      `INSERT OR IGNORE INTO auth_links (account_id, provider, provider_subject, created_at_ms)
       VALUES (?, 'better_auth', ?, ?)`,
      [byEmail.id, params.providerSubject, now],
    );
    await mergeEmailOntoAccount(db, {
      accountId: byEmail.id,
      email,
      verifiedAtMs: params.verifiedAtMs ?? now,
    });
    return byEmail;
  }

  const blocked = await findBlockedEmail(db, email);
  if (blocked !== null && !params.allowBlockedEmail) {
    throw new Error("email blocked");
  }

  const accountId = crypto.randomUUID();
  await db.exec(
    `INSERT INTO accounts (id, status, created_at_ms, updated_at_ms) VALUES (?, 'active', ?, ?)`,
    [accountId, now, now],
  );
  await db.exec(
    `INSERT INTO account_emails (account_id, email, is_primary, verified_at_ms)
     VALUES (?, ?, 1, ?)`,
    [accountId, email, params.verifiedAtMs ?? now],
  );
  await db.exec(
    `INSERT INTO auth_links (account_id, provider, provider_subject, created_at_ms)
     VALUES (?, 'better_auth', ?, ?)`,
    [accountId, params.providerSubject, now],
  );
  await mergePreAccountRecords(db, accountId, email);
  const account = await findAccountByAuthSubject(db, params.providerSubject);
  if (account === null) {
    throw new Error("account insert failed");
  }
  return account;
}

export async function mergeEmailOntoAccount(
  db: RegistryDatabase,
  params: { accountId: string; email: string; verifiedAtMs?: number },
): Promise<void> {
  const now = Date.now();
  const email = normalizeEmail(params.email);
  const blocked = await findBlockedEmail(db, email);
  if (blocked !== null && blocked.accountId !== params.accountId) {
    throw new Error("email blocked");
  }
  await db.exec(
    `INSERT OR IGNORE INTO account_emails (account_id, email, is_primary, verified_at_ms)
     VALUES (?, ?, 0, ?)`,
    [params.accountId, email, params.verifiedAtMs ?? now],
  );
  await mergePreAccountRecords(db, params.accountId, email);
  await db.exec(`UPDATE accounts SET updated_at_ms = ? WHERE id = ?`, [now, params.accountId]);
}

async function mergePreAccountRecords(
  db: RegistryDatabase,
  accountId: string,
  email: string,
): Promise<void> {
  await db.exec(
    `UPDATE marketing_consents SET account_id = ? WHERE email = ? AND account_id IS NULL`,
    [accountId, email],
  );
}

export async function listAccountEmails(
  db: RegistryDatabase,
  accountId: string,
): Promise<string[]> {
  const rows = await db.queryAll<{ email: string }>(
    `SELECT email FROM account_emails WHERE account_id = ? ORDER BY is_primary DESC, email ASC`,
    [accountId],
  );
  return rows.map((r) => r.email);
}

export async function suspendAccount(db: RegistryDatabase, accountId: string): Promise<Account> {
  const account = await findAccountById(db, accountId);
  if (account === null) throw new Error("account not found");
  const now = Date.now();
  await blockAccountEmails(db, { accountId, reason: "suspended", nowMs: now });
  await db.exec(`UPDATE accounts SET status = 'suspended', updated_at_ms = ? WHERE id = ?`, [
    now,
    accountId,
  ]);
  const out = await findAccountById(db, accountId);
  if (out === null) throw new Error("account not found");
  return out;
}

export async function reactivateAccount(db: RegistryDatabase, accountId: string): Promise<Account> {
  const account = await findAccountById(db, accountId);
  if (account === null) throw new Error("account not found");
  const now = Date.now();
  await db.exec(`UPDATE accounts SET status = 'active', updated_at_ms = ? WHERE id = ?`, [
    now,
    accountId,
  ]);
  const out = await findAccountById(db, accountId);
  if (out === null) throw new Error("account not found");
  return out;
}

export async function reactivateAccountByEmail(
  db: RegistryDatabase,
  params: { email: string; providerSubject?: string; verifiedAtMs?: number },
): Promise<Account> {
  const normalized = normalizeEmail(params.email);
  const blocked = await findBlockedEmail(db, normalized);
  if (blocked === null) throw new Error("email not blocked");
  const now = Date.now();
  const existing = await findAccountByEmail(db, normalized);
  if (existing !== null) {
    if (existing.status !== "active") {
      await db.exec(`UPDATE accounts SET status = 'active', updated_at_ms = ? WHERE id = ?`, [
        now,
        existing.id,
      ]);
    }
    if (params.providerSubject !== undefined && params.providerSubject.length > 0) {
      await db.exec(
        `INSERT OR IGNORE INTO auth_links (account_id, provider, provider_subject, created_at_ms)
         VALUES (?, 'better_auth', ?, ?)`,
        [existing.id, params.providerSubject, now],
      );
    }
    const out = await findAccountById(db, existing.id);
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

export async function deleteAccount(
  db: RegistryDatabase,
  accountId: string,
): Promise<{ accountId: string; blockedEmailsCount: number }> {
  const account = await findAccountById(db, accountId);
  if (account === null) throw new Error("account not found");
  const now = Date.now();
  const blockedEmailsCount = await blockAccountEmails(db, {
    accountId,
    reason: "deleted",
    nowMs: now,
  });
  await db.exec(`DELETE FROM accounts WHERE id = ?`, [accountId]);
  return { accountId, blockedEmailsCount };
}
