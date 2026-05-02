import { expiresAtFromHours, MAX_EXPIRY_HOURS } from "@cfd/obp-tools";
import type { TtlSpec } from "./ttl-spec.ts";

/** Wall-clock expiry timestamp used when persisting offers/ports. */
export function tsExpiredForTtl(nowMs: number, ttl: TtlSpec): number {
  switch (ttl.basis) {
    case "turns":
      return expiresAtFromHours(nowMs, MAX_EXPIRY_HOURS);
    case "hours":
      return expiresAtFromHours(nowMs, ttl.measure);
    case "minutes":
      return nowMs + ttl.measure * 60_000;
    case "seconds":
      return nowMs + ttl.measure * 1000;
    case "days":
      return nowMs + ttl.measure * 86_400_000;
    default: {
      const _e: never = ttl.basis;
      return _e;
    }
  }
}
