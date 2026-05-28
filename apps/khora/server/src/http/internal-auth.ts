import { timingSafeEqual } from "node:crypto";

function readInternalSecret(): string | undefined {
  const s = process.env.KHORA_INTERNAL_SECRET?.trim();
  return s !== undefined && s.length > 0 ? s : undefined;
}

/** True when `KHORA_INTERNAL_SECRET` is set and the request Bearer token matches. */
export function authorizeInternal(req: Request): boolean {
  const expected = readInternalSecret();
  if (expected === undefined) return false;
  const auth = req.headers.get("authorization");
  if (auth === null || !auth.startsWith("Bearer ")) return false;
  const provided = auth.slice("Bearer ".length);
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
