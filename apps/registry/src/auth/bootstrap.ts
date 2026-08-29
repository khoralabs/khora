import { normalizeEmail } from "@khoralabs/registry/accounts";

export { normalizeEmail };

export function bootstrapStaffEmails(): Set<string> {
  const raw = process.env.REGISTRY_BOOTSTRAP_EMAILS?.trim() ?? "";
  if (raw.length === 0) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => normalizeEmail(e))
      .filter((e) => e.length > 0),
  );
}

export function isBootstrapStaffEmail(email: string): boolean {
  return bootstrapStaffEmails().has(normalizeEmail(email));
}
