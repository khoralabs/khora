import type { PrincipalRegistrationRequest } from "./types";

/** Optional HTTP hints supplied by the adapter. */
export type RegistrationVerifyClientHints = {
  ip?: string;
  userAgent?: string;
};

export type RegistrationVerifyContext = {
  request: PrincipalRegistrationRequest;
  client?: RegistrationVerifyClientHints;
  /** Raw request headers (e.g. signature envelope); interpretation is adapter-defined. */
  headers: Headers;
  /** Raw POST body as text (canonical body bytes for signature verification). */
  bodyText: string;
};

/** Context for mutating HTTP routes carrying an authenticated principal claim. */
export type AuthenticatedPrincipalVerifyContext = {
  method: string;
  path: string;
  headers: Headers;
  claimedPrincipalId: PrincipalRegistrationRequest["principalId"];
  /** Raw body when the route has one (e.g. JSON POST/PATCH). */
  bodyText?: string;
};

/** Context for inbox HTTP + WebSocket upgrade. */
export type InboxAccessVerifyContext = {
  claimedPrincipalId: PrincipalRegistrationRequest["principalId"];
  path: string;
  searchParams: URLSearchParams;
  headers: Headers;
};

/**
 * Optional preflight: verify registration payloads and inbound routes before host-runtime proceeds.
 * Omitted when the embedder trusts another layer or disables verification (e.g. tests).
 */
export interface AuthPreflight {
  verifyRegistration(ctx: RegistrationVerifyContext): Promise<void>;
  verifyAuthenticatedPrincipal(ctx: AuthenticatedPrincipalVerifyContext): Promise<void>;
  verifyInboxAccess(ctx: InboxAccessVerifyContext): Promise<void>;
}
