import {
  countMembershipsForAccount,
  findAccountByEmail,
  findAccountById,
  listAccountEmails,
  listMarketingConsentsForAccount,
  listMarketingConsentsForEmail,
  normalizeEmail,
} from "@khoralabs/registry/accounts";
import type {
  RegistryAccountLookup,
  RegistryAdminSummary,
  RegistryEmailLookup,
} from "@khoralabs/registry/contracts";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
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
} from "@khoralabs/registry/contracts";

async function countByStatus(
  db: RegistryDatabase,
  table: string,
  statusColumn: string,
): Promise<Record<string, number>> {
  const rows = await db.queryAll<{ status: string; n: number }>(
    `SELECT ${statusColumn} AS status, COUNT(*) AS n FROM ${table} GROUP BY ${statusColumn}`,
  );
  const out: Record<string, number> = {};
  for (const row of rows) {
    out[row.status] = row.n;
  }
  return out;
}

export async function getRegistryAdminSummary(db: RegistryDatabase): Promise<RegistryAdminSummary> {
  const accountCounts = await countByStatus(db, "accounts", "status");
  const consentTotal = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM marketing_consents`,
  );
  const consentActive = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM marketing_consents WHERE opted_out_at_ms IS NULL`,
  );
  const listSlugRows = await db.queryAll<{ list_slug: string; n: number }>(
    `SELECT list_slug, COUNT(*) AS n FROM marketing_consents GROUP BY list_slug`,
  );
  const byListSlug: Record<string, number> = {};
  for (const row of listSlugRows) {
    byListSlug[row.list_slug] = row.n;
  }
  const hosts = await Promise.all(
    (await listAllHosts(db)).map(async (host) => {
      const state = await readHostRegistryState(db, host.id);
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
    }),
  );
  const pendingOriginRequests = await countAllPendingHostTrustedOriginRequests(db);
  const pendingQuotaRequests = await countAllPendingHostTrustedOriginQuotaRequests(db);
  const membershipRow = await db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM memberships`);

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
      total: consentTotal?.n ?? 0,
      active: consentActive?.n ?? 0,
      optedOut: (consentTotal?.n ?? 0) - (consentActive?.n ?? 0),
      byListSlug,
    },
    memberships: { total: membershipRow?.n ?? 0 },
  };
}

export async function lookupRegistryByEmail(
  db: RegistryDatabase,
  email: string,
): Promise<RegistryEmailLookup> {
  const normalized = normalizeEmail(email);
  const account = await findAccountByEmail(db, normalized);
  return {
    email: normalized,
    account,
    accountEmails: account === null ? [] : await listAccountEmails(db, account.id),
    marketingConsents: await listMarketingConsentsForEmail(db, normalized),
    membershipsCount: account === null ? 0 : await countMembershipsForAccount(db, account.id),
  };
}

export async function lookupRegistryByAccountId(
  db: RegistryDatabase,
  accountId: string,
): Promise<RegistryAccountLookup | null> {
  const account = await findAccountById(db, accountId);
  if (account === null) return null;
  return {
    account,
    accountEmails: await listAccountEmails(db, account.id),
    marketingConsents: await listMarketingConsentsForAccount(db, account.id),
    membershipsCount: await countMembershipsForAccount(db, account.id),
  };
}
