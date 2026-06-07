const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export class InvalidHostSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHostSlugError";
  }
}

/** DNS-like slug: lowercase alphanumeric and hyphens, 3–63 chars. */
export function normalizeHostSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 63) {
    throw new InvalidHostSlugError("host slug must be 3–63 characters");
  }
  if (!SLUG_RE.test(slug)) {
    throw new InvalidHostSlugError(
      "host slug must be lowercase letters, numbers, and hyphens (no leading/trailing hyphen)",
    );
  }
  return slug;
}
