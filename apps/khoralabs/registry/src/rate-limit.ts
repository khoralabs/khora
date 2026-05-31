type Bucket = { count: number; windowStartMs: number };

const buckets = new Map<string, Bucket>();

export function checkHostRateLimit(
  hostId: string,
  action: string,
  limit: number,
  windowMs: number,
): boolean {
  const key = `${hostId}:${action}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (bucket === undefined || now - bucket.windowStartMs >= windowMs) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return true;
  }
  if (bucket.count >= limit) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export function resetHostRateLimitsForTests(): void {
  buckets.clear();
}
