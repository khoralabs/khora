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
};

/** IdP HTTP surface mounted by the deployment app before federation routes. */
export type RegistryIdentityRoutes = {
  handle(req: Request, path: string): Promise<Response | null>;
};
