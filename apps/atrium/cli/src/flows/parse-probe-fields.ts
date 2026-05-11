/** Parse "ISO date" or "epoch ms" to ms; undefined when blank, throw on invalid. */
export function parseExpiresAtMsInput(raw: unknown): number | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum)) {
    if (asNum < 0) throw new Error(`expiresAt must be non-negative (got ${trimmed})`);
    return asNum;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error(`expiresAt: expected ISO date or epoch ms, got "${trimmed}"`);
  }
  return parsed;
}

/** Normalize wizard "Kinds" choice value (string for single-pick, array for multi) to string[]. */
export function normalizeMatchKindsInput(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) {
    const out = raw.filter((v): v is string => typeof v === "string" && v.length > 0);
    return out.length > 0 ? out : undefined;
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    return [raw.trim()];
  }
  return undefined;
}
