export type RateLimitRule = { windowMs: number; max: number };

export type RateLimitCheck = { ok: true } | { ok: false; retryAfterSec: number };

export function createRateLimiter(rule: RateLimitRule | null): (key: string) => RateLimitCheck {
  if (rule === null) return () => ({ ok: true });
  const buckets = new Map<string, number[]>();
  return (key: string) => {
    const now = Date.now();
    const cutoff = now - rule.windowMs;
    let hits = buckets.get(key) ?? [];
    hits = hits.filter((t) => t > cutoff);
    if (hits.length >= rule.max) {
      const oldest = hits[0] ?? now;
      const retryMs = oldest + rule.windowMs - now;
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)) };
    }
    hits.push(now);
    buckets.set(key, hits);
    return { ok: true };
  };
}

export function clientIpFromRequest(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp !== undefined && realIp.length > 0) return realIp;
  const xff = req.headers.get("x-forwarded-for")?.trim();
  if (xff !== undefined && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  return "direct";
}
