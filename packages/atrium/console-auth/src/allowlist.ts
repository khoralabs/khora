export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function bootstrapAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAIL_ALLOWLIST?.trim() ?? "";
  if (raw.length === 0) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => normalizeEmail(e))
      .filter((e) => e.length > 0),
  );
}

export function isBootstrapAdminEmail(email: string): boolean {
  return bootstrapAdminEmails().has(normalizeEmail(email));
}
