/** Default lifetime for new offers/ports when the agent omits `expiresAfterHours`. */
export const DEFAULT_EXPIRY_HOURS = 24;

/** Upper bound for `expiresAfterHours` (~1 year). */
export const MAX_EXPIRY_HOURS = 8760;

const MS_PER_HOUR = 3_600_000;

export function expiresAtFromHours(nowMs: number, hours: number): number {
  return nowMs + hours * MS_PER_HOUR;
}
