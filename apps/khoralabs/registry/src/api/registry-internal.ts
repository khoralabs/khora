import { timingSafeEqual } from "node:crypto";

export function authorizeRegistryInternal(req: Request): boolean {
  const secret = process.env.REGISTRY_INTERNAL_SECRET?.trim();
  if (secret === undefined || secret.length === 0) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) return false;
  const token = auth.slice(prefix.length);
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
