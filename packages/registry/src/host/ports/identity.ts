/** Minimal IdP session for federation — subject id + email; richer profile lives in accounts / adapter. */
export type RegistrySession = {
  user: { id: string; email: string | null };
  session: { id: string; expiresAt: Date };
};

/** Pluggable human identity for federation routes (Better Auth is one implementation). */
export type RegistryIdentityPort = {
  getSession(req: Request): Promise<RegistrySession | null>;
  getSessionCookieHeader(req: Request): string | null;
  reloadTrustedOrigins?(): void;
  /** Drop all IdP sessions for an auth user id (e.g. Better Auth `user.id`). */
  revokeSessionsForUser?(userId: string): Promise<void>;
};

/**
 * Auth-provider HTTP surface for `/api/auth/*` and server-side OTP/sign-in calls
 * used by device/agent ceremony routes.
 */
export type RegistryAuthHttpPort = {
  handleAuthApi(req: Request): Promise<Response>;
  callAuthEndpoint(path: string, init?: RequestInit): Promise<Response>;
  /** Format a raw session token as a Cookie header fragment (`name=value`). */
  formatSessionCookie(sessionToken: string): string;
  /** Prefer Set-Cookie session from an auth API response; else null. */
  extractSessionCookie(res: Response): string | null;
};

/** IdP HTTP surface mounted by the deployment app before federation routes. */
export type RegistryIdentityRoutes = {
  handle(req: Request, path: string): Promise<Response | null>;
};
