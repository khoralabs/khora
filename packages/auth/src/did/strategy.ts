import type { AgentRequestEnvelope } from "../http/signed-request/envelope";

/**
 * Pluggable per-scheme signature verifier. Implementations consume a parsed
 * {@link AgentRequestEnvelope} and the canonical request fields, derive the public key from
 * `envelope.did`, and throw if the signature does not verify.
 *
 * Envelope parsing, freshness checks, nonce-store inserts, and DID matching are owned by
 * {@link SignedRequestAuth}; strategies only handle signature verification against the DID key.
 */
export interface AuthStrategy {
  verifyEnvelope(p: {
    envelope: AgentRequestEnvelope;
    method: string;
    path: string;
    bodyText: string;
  }): Promise<void>;
}

/** Error thrown by {@link AuthStrategy.verifyEnvelope} when verification fails. */
export class AuthStrategyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthStrategyError";
  }
}
