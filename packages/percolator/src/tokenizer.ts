/**
 * Extract index terms from query text for the inverted query-term table.
 * Token rules align with Memories FTS query building (whitespace split, unicode letters/numbers).
 */
export function extractQueryTerms(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (const raw of tokens) {
    const normalized = raw.toLowerCase();
    out.add(normalized);
    if (normalized.length >= 3 && /^[\p{L}\p{N}]+$/u.test(raw)) {
      out.add(normalized.slice(0, 3));
    }
  }
  return [...out];
}

/** Token set for lexical overlap scoring on a single candidate. */
export function tokenizeForOverlap(text: string): Set<string> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return new Set();
  return new Set(
    trimmed
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.toLowerCase()),
  );
}
