import type { DidRegistrationRequest } from "./types.ts";

/** Optional HTTP hints supplied by the adapter. */
export type RegistrationVerifyClientHints = {
  ip?: string;
  userAgent?: string;
};

export type RegistrationVerifyContext = {
  request: DidRegistrationRequest;
  client?: RegistrationVerifyClientHints;
  /** Raw request headers (carries `X-Agent-*` signature envelope). */
  headers: Headers;
  /** Raw POST body as text (canonical body bytes for signature verification). */
  bodyText: string;
};

/** Context for mutating HTTP routes that carry `X-Agent-Did`. */
export type AuthenticatedAgentVerifyContext = {
  method: string;
  path: string;
  headers: Headers;
  claimedDid: string;
  /** Raw body when the route has one (e.g. JSON POST/PATCH). */
  bodyText?: string;
};

/** Context for inbox HTTP + WebSocket upgrade. */
export type InboxAccessVerifyContext = {
  claimedDid: string;
  path: string;
  searchParams: URLSearchParams;
  headers: Headers;
};

/**
 * App-supplied DID / agent verification. SwarmHost calls {@link verifyRegistration} only;
 * HTTP adapters call {@link verifyAuthenticatedAgent} and {@link verifyInboxAccess}.
 */
export interface DidVerifier {
  verifyRegistration(ctx: RegistrationVerifyContext): Promise<void>;
  verifyAuthenticatedAgent(ctx: AuthenticatedAgentVerifyContext): Promise<void>;
  verifyInboxAccess(ctx: InboxAccessVerifyContext): Promise<void>;
}
