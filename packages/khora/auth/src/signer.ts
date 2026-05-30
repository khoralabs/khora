import type { AgentSigner } from "@khoralabs/agent-persisted-signer";
import {
  AGENT_REQUEST_HEADER,
  AGENT_REQUEST_SEARCH,
  type AgentRequestEnvelope,
  canonicalAgentRequestMessage,
  canonicalAgentRequestPath,
  randomAgentRequestNonce,
  signatureBytesToB64Url,
} from "./wire";

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
  const signedPath = canonicalAgentRequestPath(ws.pathname, ws.searchParams, []);
  const signed = await signAgentRequest({
    method: "GET",
    path: signedPath,
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
