import type { Signer } from "@khoralabs/did-key-identity";
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
  signer: Signer;
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

/** Inbox multiplex WebSocket path (upgrade has no query auth; bind happens after `hello`). */
export const INBOX_WS_PATH = "/v1/inbox/ws";

/** HTTP-ish method string inside the canonical bind signature. */
export const INBOX_BIND_METHOD = "BIND";

/**
 * Canonical PATH signed for an inbox multiplex bind, including the server-issued connection id.
 * Example: `/v1/inbox/ws?connection_id=abc`.
 */
export function inboxBindCanonicalPath(connectionId: string): string {
  const sp = new URLSearchParams();
  sp.set("connection_id", connectionId);
  return `${INBOX_WS_PATH}?${sp.toString()}`;
}

export type SignInboxBindInput = {
  connectionId: string;
  signer: Signer;
  now?: () => number;
  nonce?: () => string;
};

/**
 * Sign a per-principal multiplex bind for `connectionId` (from the server `hello` frame).
 * Returns the envelope fields clients send inside a `bind` frame.
 */
export async function signInboxBind(input: SignInboxBindInput): Promise<AgentRequestEnvelope> {
  const signed = await signAgentRequest({
    method: INBOX_BIND_METHOD,
    path: inboxBindCanonicalPath(input.connectionId),
    bodyText: "",
    signer: input.signer,
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.nonce !== undefined ? { nonce: input.nonce } : {}),
  });
  return signed.envelope;
}

export type SignedInboxUrlInput = {
  baseUrl: string;
  /** Defaults to {@link INBOX_WS_PATH}. */
  path?: string;
  signer: Signer;
  now?: () => number;
  nonce?: () => string;
};

/**
 * @deprecated Prefer unsigned upgrade + {@link signInboxBind} (multiplex stream).
 * Build a signed WebSocket URL for legacy single-DID upgrade auth.
 */
export async function signedInboxUrl(input: SignedInboxUrlInput): Promise<string> {
  const path = input.path ?? INBOX_WS_PATH;
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

/** Unsigned inbox WebSocket URL (auth via post-upgrade bind). */
export function inboxWebSocketUpgradeUrl(baseUrl: string, path = INBOX_WS_PATH): string {
  const root = new URL(baseUrl.trim().replace(/\/$/, ""));
  const ws = new URL(path, root);
  ws.protocol = root.protocol === "https:" ? "wss:" : "ws:";
  return ws.toString();
}
