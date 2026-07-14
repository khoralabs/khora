import type { RateLimitRule } from "./rate-limit";

export function readAdminRootToken(): string | undefined {
  const token =
    process.env.ADMIN_ROOT_TOKEN?.trim() ??
    process.env.KHORA_CONSOLE_ROOT_TOKEN?.trim() ??
    process.env.REGISTRY_CONSOLE_ROOT_TOKEN?.trim();
  if (token === undefined || token.length < 16) return undefined;
  return token;
}

/** Secure session cookies in prod (HTTPS public URL or NODE_ENV=production). */
export function readSecureCookies(): boolean {
  const explicit =
    process.env.ADMIN_SECURE_COOKIES?.trim().toLowerCase() ??
    process.env.KHORA_SECURE_COOKIES?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;
  if (process.env.NODE_ENV === "production") return true;
  const publicUrl = process.env.KHORA_PUBLIC_BASE_URL?.trim() ?? process.env.REGISTRY_URL?.trim();
  return publicUrl?.startsWith("https://") ?? false;
}

/** Max admin login attempts per IP per minute; 0 or invalid disables. */
export function readAdminTokenLoginRateLimit(): RateLimitRule | null {
  const raw =
    process.env.ADMIN_TOKEN_LOGIN_RL_PER_MIN?.trim() ??
    process.env.KHORA_CONSOLE_LOGIN_RL_PER_MIN?.trim();
  if (raw === undefined || raw === "") return { windowMs: 60_000, max: 10 };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { windowMs: 60_000, max: Math.floor(n) };
}

export function readAdminTokenAuthKind(): "root-token" {
  const kind =
    process.env.ADMIN_TOKEN_AUTH?.trim().toLowerCase() ??
    process.env.KHORA_CONSOLE_AUTH?.trim().toLowerCase() ??
    "root-token";
  if (kind !== "root-token") {
    throw new Error(`ADMIN_TOKEN_AUTH=${kind} is not supported yet; use root-token.`);
  }
  return kind;
}
