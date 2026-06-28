import type {
  RegistryAccountLookup,
  RegistryEmailLookup,
} from "@khoralabs/registry-accounts-contracts";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";
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
