import type { IncomingHttpHeaders } from "node:http";

/**
 * Extracts a Bearer token from `Authorization` (HTTP/1.1 or HTTP/2 header maps).
 * Returns `undefined` when missing or malformed.
 */
export function parseBearerToken(headers: IncomingHttpHeaders): string | undefined {
  const v = headers.authorization;
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return undefined;
  return /^Bearer\s+(\S+)$/i.exec(s.trim())?.[1];
}
