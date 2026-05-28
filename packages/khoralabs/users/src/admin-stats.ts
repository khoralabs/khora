import type { Database } from "bun:sqlite";
import {
  listAccessTokenRequestsForAccount,
  listAccessTokenRequestsForEmail,
} from "./access-token-requests.ts";
import { findAccountByEmail, findAccountById, listAccountEmails } from "./accounts.ts";
import { listAllHosts } from "./khora-hosts.ts";
import {
  listMarketingConsentsForAccount,
  listMarketingConsentsForEmail,
} from "./marketing-consents.ts";
import { countMembershipsForAccount } from "./memberships.ts";
import { normalizeEmail } from "./normalize.ts";
import type { AccessTokenRequest, Account, KhoraHost, MarketingConsent } from "./types.ts";

export type RegistryAccountsSummary = {
  total: number;
  active: number;
  suspended: number;
};

export type RegistryAccessTokenRequestsSummary = {
  total: number;
  withoutAccount: number;
  byStatus: {
    pending: number;
    minted: number;
    sent: number;
    redeemed: number;
  };
};

export type RegistryMarketingConsentsSummary = {
  total: number;
  active: number;
  optedOut: number;
  byListSlug: Record<string, number>;
};

export type RegistryHostsSummary = {
  total: number;
  active: number;
  items: KhoraHost[];
};

export type RegistryAdminSummary = {
  accounts: RegistryAccountsSummary;
  hosts: RegistryHostsSummary;
  accessTokenRequests: RegistryAccessTokenRequestsSummary;
  marketingConsents: RegistryMarketingConsentsSummary;
  memberships: { total: number };
};

export type RegistryEmailLookup = {
  email: string;
  account: Account | null;
  accountEmails: string[];
  accessRequests: AccessTokenRequest[];
  marketingConsents: MarketingConsent[];
  membershipsCount: number;
};

export type RegistryAccountLookup = {
  account: Account;
  accountEmails: string[];
  accessRequests: AccessTokenRequest[];
  marketingConsents: MarketingConsent[];
  membershipsCount: number;
};

export type RegistryAuthUser = {
  id: string;
  email: string;
  role: string | null;
};

export type RegistryEmailLookupResponse = RegistryEmailLookup & {
  authUser: RegistryAuthUser | null;
};

function countByStatus(db: Database, table: string, statusColumn: string): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT ${statusColumn} AS status, COUNT(*) AS n FROM ${table} GROUP BY ${statusColumn}`,
    )
    .all() as { status: string; n: number }[];
  const out: Record<string, number> = {};
  for (const row of rows) {
    out[row.status] = row.n;
  }
  return out;
}

export function getRegistryAdminSummary(db: Database): RegistryAdminSummary {
  const accountCounts = countByStatus(db, "accounts", "status");
  const requestCounts = countByStatus(db, "access_token_requests", "status");
  const withoutAccountRow = db
    .prepare(`SELECT COUNT(*) AS n FROM access_token_requests WHERE account_id IS NULL`)
    .get() as { n: number };
  const consentTotal = db.prepare(`SELECT COUNT(*) AS n FROM marketing_consents`).get() as {
    n: number;
  };
  const consentActive = db
    .prepare(`SELECT COUNT(*) AS n FROM marketing_consents WHERE opted_out_at_ms IS NULL`)
    .get() as { n: number };
  const listSlugRows = db
    .prepare(`SELECT list_slug, COUNT(*) AS n FROM marketing_consents GROUP BY list_slug`)
    .all() as { list_slug: string; n: number }[];
  const byListSlug: Record<string, number> = {};
  for (const row of listSlugRows) {
    byListSlug[row.list_slug] = row.n;
  }
  const hosts = listAllHosts(db);
  const membershipRow = db.prepare(`SELECT COUNT(*) AS n FROM memberships`).get() as { n: number };

  return {
    accounts: {
      total: (accountCounts.active ?? 0) + (accountCounts.suspended ?? 0),
      active: accountCounts.active ?? 0,
      suspended: accountCounts.suspended ?? 0,
    },
    hosts: {
      total: hosts.length,
      active: hosts.filter((h) => h.status === "active").length,
      items: hosts,
    },
    accessTokenRequests: {
      total: Object.values(requestCounts).reduce((a, b) => a + b, 0),
      withoutAccount: withoutAccountRow.n,
      byStatus: {
        pending: requestCounts.pending ?? 0,
        minted: requestCounts.minted ?? 0,
        sent: requestCounts.sent ?? 0,
        redeemed: requestCounts.redeemed ?? 0,
      },
    },
    marketingConsents: {
      total: consentTotal.n,
      active: consentActive.n,
      optedOut: consentTotal.n - consentActive.n,
      byListSlug,
    },
    memberships: { total: membershipRow.n },
  };
}

export function lookupRegistryByEmail(db: Database, email: string): RegistryEmailLookup {
  const normalized = normalizeEmail(email);
  const account = findAccountByEmail(db, normalized);
  return {
    email: normalized,
    account,
    accountEmails: account === null ? [] : listAccountEmails(db, account.id),
    accessRequests: listAccessTokenRequestsForEmail(db, normalized),
    marketingConsents: listMarketingConsentsForEmail(db, normalized),
    membershipsCount: account === null ? 0 : countMembershipsForAccount(db, account.id),
  };
}

export function lookupRegistryByAccountId(
  db: Database,
  accountId: string,
): RegistryAccountLookup | null {
  const account = findAccountById(db, accountId);
  if (account === null) return null;
  return {
    account,
    accountEmails: listAccountEmails(db, account.id),
    accessRequests: listAccessTokenRequestsForAccount(db, account.id),
    marketingConsents: listMarketingConsentsForAccount(db, account.id),
    membershipsCount: countMembershipsForAccount(db, account.id),
  };
}
