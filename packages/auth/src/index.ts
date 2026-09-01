export type { PersistableSigner, Signer } from "@khoralabs/did-key-identity";
export {
  generateIdentity,
  type IdentityFile,
  loadIdentity,
  loadOrCreateIdentity,
  saveIdentity,
} from "@khoralabs/did-key-identity";

export { publicKeyForDid } from "./did/pubkey";
export { type AuthStrategy, AuthStrategyError } from "./did/strategy";
export { createDidKeyEd25519Strategy } from "./did/strategy-ed25519-key";

export { extractBearerToken, tokensEqual } from "./http/bearer";
export {
  type AdminPrincipal,
  type AdminTokenAuth,
  createAdminTokenAuthFromEnv,
  createRootTokenAdminAuth,
  type RootTokenAdminAuthOptions,
  readAdminRootToken,
  readAdminTokenAuthKind,
  readSecureCookies,
} from "./http/root-token-auth";
export {
  clearSessionCookie,
  issueSessionCookie,
  readSessionPrincipal,
} from "./http/session-cookie";
export {
  AGENT_REQUEST_FRESHNESS_WINDOW_MS,
  AGENT_REQUEST_HEADER,
  AGENT_REQUEST_SEARCH,
  type AgentRequestEnvelope,
  canonicalAgentRequestMessage,
  canonicalAgentRequestPath,
  envelopeSignatureBytes,
  parseAgentRequestEnvelopeFromHeaders,
  parseAgentRequestEnvelopeFromSearch,
  randomAgentRequestNonce,
  signatureBytesToB64Url,
} from "./http/signed-request/envelope";
export {
  AuthError,
  type AuthenticatedPrincipalVerifyContext,
  createSignedRequestAuth,
  type InboxAccessVerifyContext,
  type RegistrationVerifyClientHints,
  type RegistrationVerifyContext,
  SignedRequestAuth,
  type SignedRequestAuthOptions,
  type SignedRequestPreflight,
  type VerifySignedAgentRequestOptions,
  verifySignedAgentRequest,
} from "./http/signed-request/facade";
export {
  INBOX_BIND_METHOD,
  INBOX_WS_PATH,
  inboxBindCanonicalPath,
  inboxWebSocketUpgradeUrl,
  type SignAgentRequestInput,
  type SignedAgentRequest,
  type SignInboxBindInput,
  signAgentRequest,
  signInboxBind,
} from "./http/signed-request/sign";

export {
  clientIpFromRequest,
  createRateLimiter,
  type RateLimitCheck,
  type RateLimitRule,
} from "./rate-limit/sliding-window";

export { createMemoryNonceStore } from "./replay/memory-nonce-store";
export type { NonceStore } from "./replay/nonce-store";
