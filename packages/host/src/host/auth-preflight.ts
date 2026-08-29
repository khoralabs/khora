import type {
  AuthenticatedPrincipalVerifyContext,
  InboxAccessVerifyContext,
  RegistrationVerifyClientHints,
  SignedRequestPreflight,
} from "@khoralabs/khora-auth";
import type { PrincipalRegistrationRequest } from "@khoralabs/khora-contracts";

export type {
  AuthenticatedPrincipalVerifyContext,
  InboxAccessVerifyContext,
  RegistrationVerifyClientHints,
};

/** Host registration verify context (contracts-typed principal request). */
export type RegistrationVerifyContext = {
  request: PrincipalRegistrationRequest;
  client?: RegistrationVerifyClientHints;
  headers: Headers;
  bodyText: string;
};

/**
 * Optional preflight: verify registration payloads and inbound routes before host proceeds.
 * Satisfied by {@link SignedRequestPreflight} from `@khoralabs/khora-auth` (structural).
 */
export interface AuthPreflight {
  verifyRegistration(ctx: RegistrationVerifyContext): Promise<void>;
  verifyAuthenticatedPrincipal(ctx: AuthenticatedPrincipalVerifyContext): Promise<void>;
  verifyInboxAccess(ctx: InboxAccessVerifyContext): Promise<void>;
}

/** Assert a signed-request preflight can be used as host AuthPreflight. */
export function asHostAuthPreflight(preflight: SignedRequestPreflight): AuthPreflight {
  return preflight as AuthPreflight;
}
