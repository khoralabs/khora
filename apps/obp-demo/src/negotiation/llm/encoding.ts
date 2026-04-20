/**
 * Best-effort extraction of a human-readable tail from `|t=` in public type strings.
 * Does not enforce any deal schema.
 */
export function parsePublicText(type: string): string | undefined {
  const idx = type.indexOf("|t=");
  if (idx < 0) {
    return undefined;
  }
  return type.slice(idx + "|t=".length).trim() || undefined;
}
