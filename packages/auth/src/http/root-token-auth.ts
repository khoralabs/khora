import { extractBearerToken, tokensEqual } from "./bearer";

export type AdminPrincipal = {
  id: string;
  role: "root" | "admin" | "readonly";
};

export type AdminTokenAuth = {
  /** null = unauthenticated */
  authenticate(req: Request): Promise<AdminPrincipal | null>;
};

export type RootTokenAdminAuthOptions = {
  rootToken: string;
};

export function createRootTokenAdminAuth(options: RootTokenAdminAuthOptions): AdminTokenAuth {
  const { rootToken } = options;

  return {
    async authenticate(req: Request): Promise<AdminPrincipal | null> {
      const bearer = extractBearerToken(req);
      if (bearer.length > 0 && tokensEqual(bearer, rootToken)) {
        return { id: "root", role: "root" };
      }
      return null;
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

/** @deprecated Cookie login removed; kept for env compatibility. Always null. */
export function readAdminTokenLoginRateLimit(): null {
  return null;
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
  return createRootTokenAdminAuth({ rootToken });
}
