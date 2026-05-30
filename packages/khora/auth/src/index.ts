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
  AuthError,
  type CreateKhoraDidAuthOptions,
  createKhoraDidAuth,
  KhoraDidAuth,
  type KhoraDidAuthOptions,
} from "./auth";
export type { NonceStore } from "./nonce-store";
export {
  canonicalKhoraPostSigningPayload,
  KHORA_POST_SIGNATURE_V1,
  type KhoraPostSigningPayloadV1,
  khoraPostSigningPayloadFromCreate,
  khoraPostSigningPayloadFromPatch,
  signingPayloadForPatch,
  signKhoraPostPayload,
  verifyKhoraPostSignature,
} from "./post-signing";
export {
  type SignAgentRequestInput,
  type SignedAgentRequest,
  type SignedInboxUrlInput,
  signAgentRequest,
  signedInboxUrl,
} from "./signer";
export { createSqliteNonceStore } from "./sqlite-nonce-store";
export { type AuthStrategy, AuthStrategyError } from "./strategy";
export { createDidKeyEd25519Strategy } from "./strategy-did-key";
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
} from "./wire";
