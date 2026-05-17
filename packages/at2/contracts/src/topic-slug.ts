/** Normalize hashtag-style topic to a canonical slug (lowercase alphanumerics + underscore). */
export function normalizeTopicSlug(raw: string): string {
  const s = raw.trim().replace(/^#/, "").toLowerCase();
  if (s.length === 0) {
    throw new Error("topic slug is empty");
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(s)) {
    throw new Error(
      "topic slug must start with alphanumeric and contain only a-z 0-9 _ - (max 63 chars)",
    );
  }
  return s;
}
