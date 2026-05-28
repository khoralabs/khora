import type { AgentRequestEnvelope } from "./wire.ts";

/**
 * Pluggable per-scheme signature verifier. Implementations consume a parsed
 * {@link AgentRequestEnvelope} and the canonical request fields, derive the public key from
 * `envelope.did`, and throw if the signature does not verify.
 *
 * Envelope parsing, freshness checks, nonce-store inserts, and DID matching are owned by
 * {@link KhoraDidAuth}; strategies only handle the "does this signature verify against this
 * DID's public key?" question.
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
