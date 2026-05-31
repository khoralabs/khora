import type { Database } from "bun:sqlite";
import type {
  RegistryAccountLookup,
  RegistryEmailLookup,
} from "@khoralabs/registry-accounts-contracts";
import { findAccountByEmail, findAccountById, listAccountEmails } from "./accounts";
import {
  listMarketingConsentsForAccount,
  listMarketingConsentsForEmail,
} from "./marketing-consents";
import { countMembershipsForAccount } from "./memberships";
import { normalizeEmail } from "./normalize";

export type {
  RegistryAccountLookup,
  RegistryAuthUser,
  RegistryEmailLookup,
  RegistryEmailLookupResponse,
} from "@khoralabs/registry-accounts-contracts";

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
