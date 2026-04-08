import { createHash } from "node:crypto";

/**
 * Deterministic string primary keys: SHA-256 over `prefix` and `parts` (NUL-separated), truncated to 24 hex chars.
 */
export function stableId(prefix: string, ...parts: string[]): string {
  const h = createHash("sha256")
    .update([prefix, ...parts].join("\0"))
    .digest("hex");
  return `${prefix}_${h.slice(0, 24)}`;
}

/** Serialize optional JSON properties for SQLite `TEXT` columns; empty objects become `NULL`. */
export function jsonOrNull(v: Record<string, unknown> | undefined): string | null {
  if (v === undefined || Object.keys(v).length === 0) return null;
  return JSON.stringify(v);
}
