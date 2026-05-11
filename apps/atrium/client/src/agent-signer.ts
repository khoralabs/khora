/**
 * Minimal abstraction over an Ed25519 agent identity used by {@link AtriumClient}.
 *
 * `EdDSASigner` from `iso-signatures` satisfies this interface directly; tests can supply
 * deterministic mocks without pulling iso-signatures.
 */
export interface AgentSigner {
  /** Resolved `did:key:…` for this signer. */
  readonly did: string;
  /** Sign the canonical request bytes with Ed25519. */
  sign(message: Uint8Array): Promise<Uint8Array>;
}
