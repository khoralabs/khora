/** Active when not revoked and not past expired_at_ms. */
export function isActive(
  row: { revoked_at_ms: number | null; expired_at_ms: number | null },
  nowMs = Date.now(),
): boolean {
  if (row.revoked_at_ms !== null) return false;
  if (row.expired_at_ms !== null && row.expired_at_ms <= nowMs) return false;
  return true;
}

export const ACTIVE_GRANT_SQL = `(revoked_at_ms IS NULL AND (expired_at_ms IS NULL OR expired_at_ms > ?))`;

export const ACTIVE_ENTITLEMENT_SQL = `(revoked_at_ms IS NULL AND (expired_at_ms IS NULL OR expired_at_ms > ?))`;
