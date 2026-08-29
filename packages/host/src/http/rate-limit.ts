import { AsyncLocalStorage } from "node:async_hooks";
import { isIP } from "node:net";

export type RateLimitRule = { windowMs: number; max: number };

/** Positive integer = max events per rolling window; 0 or invalid = disabled. */
export function envRatePerMinute(
  raw: string | undefined,
  defaultMax: number,
): RateLimitRule | null {
  if (raw === undefined || raw.trim() === "") {
    return { windowMs: 60_000, max: defaultMax };
  }
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return { windowMs: 60_000, max: Math.floor(n) };
}

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

const peerIpStore = new AsyncLocalStorage<string | null>();

export function runWithRequestPeerIp<T>(peerIp: string | null, fn: () => T): T {
  return peerIpStore.run(peerIp, fn);
}

function parseTrustedProxies(): string[] {
  const raw = process.env.TRUSTED_PROXIES?.trim() ?? process.env.KHORA_TRUSTED_PROXIES?.trim();
  if (raw === undefined || raw.length === 0) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Exact IP match for trusted proxy peers (CIDR support can be added later). */
function peerIsTrusted(peerIp: string | null | undefined): boolean {
  if (peerIp === undefined || peerIp === null || peerIp.length === 0) return false;
  const trusted = parseTrustedProxies();
  if (trusted.length === 0) return false;
  const normalized = peerIp.replace(/^::ffff:/, "");
  return trusted.some((t) => t === peerIp || t === normalized);
}

export type ClientIpOptions = {
  /** Socket / Bun request peer IP when available. */
  peerIp?: string | null;
};

/**
 * Client IP for rate limits. Forwarded headers are honored only when the peer is in
 * TRUSTED_PROXIES / KHORA_TRUSTED_PROXIES; otherwise use peer IP or "direct".
 *
 * Prefer `runWithRequestPeerIp` at the HTTP edge so peer IP is available without
 * threading it through every handler.
 */
export function clientIpFromRequest(req: Request, options?: ClientIpOptions): string {
  const peer =
    options?.peerIp?.trim() ||
    peerIpStore.getStore() ||
    (typeof (req as Request & { requestIP?: string | null }).requestIP === "string"
      ? (req as Request & { requestIP?: string }).requestIP
      : null);

  if (peerIsTrusted(peer)) {
    const realIp = req.headers.get("x-real-ip")?.trim();
    if (realIp !== undefined && realIp.length > 0 && isIP(realIp.replace(/^::ffff:/, "")) !== 0) {
      return realIp;
    }
    const xff = req.headers.get("x-forwarded-for")?.trim();
    if (xff !== undefined && xff.length > 0) {
      const first = xff.split(",")[0]?.trim();
      if (first !== undefined && first.length > 0) return first;
    }
  }

  if (peer !== undefined && peer !== null && peer.length > 0) return peer;
  return "direct";
}
