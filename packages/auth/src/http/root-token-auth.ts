import {
  clientIpFromRequest,
  createRateLimiter,
  type RateLimitRule,
} from "../rate-limit/sliding-window";
import { extractBearerToken, tokensEqual } from "./bearer";
import { clearSessionCookie, issueSessionCookie, readSessionPrincipal } from "./session-cookie";

export type AdminPrincipal = {
  id: string;
  role: "root" | "admin" | "readonly";
};

export type AdminTokenAuth = {
  /** null = unauthenticated */
  authenticate(req: Request): Promise<AdminPrincipal | null>;
  /** login / logout / session routes under /admin/api/* */
  route?(req: Request, url: URL): Promise<Response | undefined>;
};

export type RootTokenAdminAuthOptions = {
  rootToken: string;
  secureCookies?: boolean;
  loginRateLimit?: RateLimitRule | null;
};

export function createRootTokenAdminAuth(options: RootTokenAdminAuthOptions): AdminTokenAuth {
  const { rootToken, secureCookies = false, loginRateLimit = null } = options;
  const cookieOptions = { secure: secureCookies };
  const loginRateLimiter = createRateLimiter(loginRateLimit ?? null);

  return {
    async authenticate(req: Request): Promise<AdminPrincipal | null> {
      const bearer = extractBearerToken(req);
      if (bearer.length > 0 && tokensEqual(bearer, rootToken)) {
        return { id: "root", role: "root" };
      }
      return readSessionPrincipal(req, rootToken);
    },

    async route(req: Request, url: URL): Promise<Response | undefined> {
      if (url.pathname === "/admin/api/login" && req.method === "POST") {
        const ip = clientIpFromRequest(req);
        const rl = loginRateLimiter(`login:ip:${ip}`);
        if (!rl.ok) {
          return Response.json(
            { error: "Too many requests", code: "rate_limited" },
            {
              status: 429,
              headers: { "Retry-After": String(rl.retryAfterSec) },
            },
          );
        }

        let body: { token?: string };
        try {
          body = (await req.json()) as { token?: string };
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const token = typeof body.token === "string" ? body.token : "";
        if (token.length === 0 || !tokensEqual(token, rootToken)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": issueSessionCookie(rootToken, cookieOptions),
          },
        });
      }

      if (url.pathname === "/admin/api/logout" && req.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": clearSessionCookie(cookieOptions),
          },
        });
      }

      if (url.pathname === "/admin/api/session" && req.method === "GET") {
        const principal = readSessionPrincipal(req, rootToken);
        if (principal === null) {
          return Response.json({ authenticated: false }, { status: 401 });
        }
        return Response.json({ authenticated: true, principal });
      }

      return undefined;
    },
  };
}

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

/** Returns null when admin token auth is disabled (no root token configured). */
export function createAdminTokenAuthFromEnv(): AdminTokenAuth | null {
  const rootToken = readAdminRootToken();
  if (rootToken === undefined) return null;
  readAdminTokenAuthKind();
  return createRootTokenAdminAuth({
    rootToken,
    secureCookies: readSecureCookies(),
    loginRateLimit: readAdminTokenLoginRateLimit(),
  });
}
