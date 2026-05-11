import {
  AGENT_REQUEST_HEADER,
  AGENT_REQUEST_SEARCH,
  type AgentRequestEnvelope,
  canonicalAgentRequestMessage,
  randomAgentRequestNonce,
  signatureBytesToB64Url,
} from "./wire.ts";

/**
 * Minimal abstraction over an agent identity used by the client to sign every request.
 * Implementations are pluggable per auth scheme; the default
 * (see {@link generateAgentIdentity} / {@link loadIdentity}) is `did:key` + Ed25519.
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

export type SignAgentRequestInput = {
  method: string;
  path: string;
  bodyText: string;
  signer: AgentSigner;
  /** Override the clock (defaults to `Date.now`). */
  now?: () => number;
  /** Override the nonce generator (defaults to `randomAgentRequestNonce`). */
  nonce?: () => string;
};

export type SignedAgentRequest = {
  /** Headers ready to merge into a fetch request. */
  headers: Record<string, string>;
  envelope: AgentRequestEnvelope;
};

/**
 * Build the four `X-Agent-*` headers (plus the parsed envelope) for the given
 * METHOD + PATH + body using the signer's DID.
 */
export async function signAgentRequest(input: SignAgentRequestInput): Promise<SignedAgentRequest> {
  const timestampMs = (input.now ?? Date.now)();
  const nonce = (input.nonce ?? randomAgentRequestNonce)();
  const message = await canonicalAgentRequestMessage({
    method: input.method,
    path: input.path,
    timestampMs,
    nonce,
    bodyText: input.bodyText,
  });
  const sigBytes = await input.signer.sign(message);
  const signatureB64Url = signatureBytesToB64Url(sigBytes);
  const headers: Record<string, string> = {
    [AGENT_REQUEST_HEADER.did]: input.signer.did,
    [AGENT_REQUEST_HEADER.ts]: String(timestampMs),
    [AGENT_REQUEST_HEADER.nonce]: nonce,
    [AGENT_REQUEST_HEADER.sig]: signatureB64Url,
  };
  return {
    headers,
    envelope: { did: input.signer.did, timestampMs, nonce, signatureB64Url },
  };
}

export type SignedInboxUrlInput = {
  baseUrl: string;
  /** Defaults to `/v1/inbox/ws`. */
  path?: string;
  signer: AgentSigner;
  now?: () => number;
  nonce?: () => string;
};

/**
 * Build a signed WebSocket URL for the inbox upgrade. Carries `did/ts/nonce/sig` query params
 * (the host has no headers available pre-upgrade).
 */
export async function signedInboxUrl(input: SignedInboxUrlInput): Promise<string> {
  const path = input.path ?? "/v1/inbox/ws";
  const root = new URL(input.baseUrl.trim().replace(/\/$/, ""));
  const ws = new URL(path, root);
  ws.protocol = root.protocol === "https:" ? "wss:" : "ws:";
  const signed = await signAgentRequest({
    method: "GET",
    path,
    bodyText: "",
    signer: input.signer,
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.nonce !== undefined ? { nonce: input.nonce } : {}),
  });
  ws.searchParams.set(AGENT_REQUEST_SEARCH.did, signed.envelope.did);
  ws.searchParams.set(AGENT_REQUEST_SEARCH.ts, String(signed.envelope.timestampMs));
  ws.searchParams.set(AGENT_REQUEST_SEARCH.nonce, signed.envelope.nonce);
  ws.searchParams.set(AGENT_REQUEST_SEARCH.sig, signed.envelope.signatureB64Url);
  return ws.toString();
}
