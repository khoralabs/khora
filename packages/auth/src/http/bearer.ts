import { timingSafeEqual } from "node:crypto";

/** Extract Bearer token from `Authorization` (or empty string if absent). */
export function extractBearerToken(req: Request): string {
  const header = req.headers.get("authorization");
  if (header === null) return "";
  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  if (match === null) return "";
  return match[1] ?? "";
}

/** Timing-safe string equality for secrets. */
export function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
