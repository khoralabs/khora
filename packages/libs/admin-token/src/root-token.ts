import { clientIpFromRequest, createRateLimiter, type RateLimitRule } from "./rate-limit";
import {
  clearSessionCookie,
  issueSessionCookie,
  readSessionPrincipal,
  tokensEqual,
} from "./session-cookie";
import type { AdminPrincipal, AdminTokenAuth } from "./types";

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
