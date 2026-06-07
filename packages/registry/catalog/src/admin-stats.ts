import type { Database } from "bun:sqlite";
import {
  countMembershipsForAccount,
  findAccountByEmail,
  findAccountById,
  listAccountEmails,
  listMarketingConsentsForAccount,
  listMarketingConsentsForEmail,
  normalizeEmail,
} from "@khoralabs/registry-accounts";
import type {
  RegistryAccountLookup,
  RegistryEmailLookup,
} from "@khoralabs/registry-accounts-contracts";
import type { RegistryAdminSummary } from "@khoralabs/registry-catalog-contracts";
import {
  countAllPendingHostTrustedOriginQuotaRequests,
  countAllPendingHostTrustedOriginRequests,
  readHostRegistryState,
} from "./host-trusted-origins";
import { listAllHosts } from "./khora-hosts";

export type {
  RegistryAccountLookup,
  RegistryAuthUser,
  RegistryEmailLookup,
  RegistryEmailLookupResponse,
} from "@khoralabs/registry-accounts-contracts";

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
  const hosts = listAllHosts(db).map((host) => {
    const state = readHostRegistryState(db, host.id);
    return {
      ...host,
      trustedOrigins: state?.origins ?? [],
      trustedOriginQuota: state?.quota ?? {
        used: 0,
        pending: 0,
        included: host.includedTrustedOrigins,
      },
      pendingOriginRequestCount: state?.pendingOriginRequests.length ?? 0,
      pendingQuotaRequestCount: state?.pendingQuotaRequest !== null ? 1 : 0,
    };
  });
  const pendingOriginRequests = countAllPendingHostTrustedOriginRequests(db);
  const pendingQuotaRequests = countAllPendingHostTrustedOriginQuotaRequests(db);
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
      pendingOriginRequests,
      pendingQuotaRequests,
      items: hosts,
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
    marketingConsents: listMarketingConsentsForAccount(db, account.id),
    membershipsCount: countMembershipsForAccount(db, account.id),
  };
}
