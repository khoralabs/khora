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
