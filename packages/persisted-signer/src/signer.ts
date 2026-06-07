/**
 * Minimal abstraction over an agent identity used to sign canonical byte messages.
 * Implementations are pluggable per auth scheme; the default
 * (see {@link generateAgentIdentity} / {@link loadIdentity} in `./identity.ts`) is `did:key` + Ed25519.
 */
export interface AgentSigner {
  /** Resolved `did:…` for this signer. */
  readonly did: string;
  /** Sign the canonical request bytes. */
  sign(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * An {@link AgentSigner} whose private key material can be serialized to a string for on-disk
 * persistence. Returned by {@link generateAgentIdentity}, {@link loadIdentity}, and
 * {@link loadOrCreateIdentity}, and consumed by {@link saveIdentity}.
 *
 * The exact `export()` encoding is opaque to callers — only this package writes / reads it.
 */
export interface PersistableAgentSigner extends AgentSigner {
  /** Serialize private key material for {@link saveIdentity}. */
  export(): string;
}
