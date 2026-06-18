import type { AccountProfile } from "@shared/accounts/row";

export function formatAccountDisplayName(account: AccountProfile): string {
  const trimmed = account.fullName?.trim() ?? "";
  if (trimmed.length > 0) return trimmed;

  const email = account.registryUserId;
  const atIndex = email.indexOf("@");
  if (atIndex !== -1) {
    const localPart = email.slice(0, atIndex);
    if (localPart.length > 0) return localPart;
  }

  return email;
}

export function accountDescriptionSubtitle(account: AccountProfile): string {
  const jobFunction = account.jobFunction?.trim() ?? "";
  if (jobFunction.length > 0) return jobFunction;
  return account.registryUserId;
}
