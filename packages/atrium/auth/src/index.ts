export type { AgentSigner, PersistableAgentSigner } from "@khoralabs/agent-persisted-signer";
export {
  type AgentIdentityFile,
  defaultIdentityPath,
  generateAgentIdentity,
  loadIdentity,
  loadOrCreateIdentity,
  saveIdentity,
} from "@khoralabs/agent-persisted-signer";
export {
  AtriumDidAuth,
  type AtriumDidAuthOptions,
  AuthError,
  type CreateAtriumDidAuthOptions,
  createAtriumDidAuth,
} from "./auth.ts";
export type { NonceStore } from "./nonce-store.ts";
export {
  ATRIUM_POST_SIGNATURE_V1,
  type AtriumPostSigningPayloadV1,
  atriumPostSigningPayloadFromCreate,
  atriumPostSigningPayloadFromPatch,
  canonicalAtriumPostSigningPayload,
  signAtriumPostPayload,
  signingPayloadForPatch,
  verifyAtriumPostSignature,
} from "./post-signing.ts";
export {
  type SignAgentRequestInput,
  type SignedAgentRequest,
  type SignedInboxUrlInput,
  signAgentRequest,
  signedInboxUrl,
} from "./signer.ts";
export { createSqliteNonceStore } from "./sqlite-nonce-store.ts";
export { type AuthStrategy, AuthStrategyError } from "./strategy.ts";
export { createDidKeyEd25519Strategy } from "./strategy-did-key.ts";
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
} from "./wire.ts";
