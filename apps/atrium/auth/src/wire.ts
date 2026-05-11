/** Header names for per-request agent signatures (used on every authenticated route). */
export const AGENT_REQUEST_HEADER = {
  did: "X-Agent-Did",
  ts: "X-Agent-Timestamp",
  nonce: "X-Agent-Nonce",
  sig: "X-Agent-Signature",
} as const;

/** Search-param keys for WebSocket upgrade signing (no headers available pre-upgrade). */
export const AGENT_REQUEST_SEARCH = {
  did: "did",
  ts: "ts",
  nonce: "nonce",
  sig: "sig",
} as const;

/** Default timestamp freshness window (ms). Requests outside `|now - ts| <= window` are rejected. */
export const AGENT_REQUEST_FRESHNESS_WINDOW_MS = 60_000;

/** Parsed agent-signed envelope. */
export type AgentRequestEnvelope = {
  did: string;
  timestampMs: number;
  nonce: string;
  signatureB64Url: string;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i] as number);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256B64Url(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase64Url(new Uint8Array(buf));
}

/**
 * Canonical message bound by an agent signature: `METHOD\nPATH\nts\nnonce\nsha256(body) b64url`.
 * Returns UTF-8 bytes ready to be signed/verified with Ed25519.
 */
export async function canonicalAgentRequestMessage(p: {
  method: string;
  path: string;
  timestampMs: number;
  nonce: string;
  bodyText: string;
}): Promise<Uint8Array> {
  const bodyHash = await sha256B64Url(p.bodyText);
  const message = `${p.method.toUpperCase()}\n${p.path}\n${p.timestampMs}\n${p.nonce}\n${bodyHash}`;
  return new TextEncoder().encode(message);
}

function parseEnvelopeFromGetters(
  get: (key: string) => string | null,
  did: string | null,
): AgentRequestEnvelope | undefined {
  const tsRaw = get("ts");
  const nonce = get("nonce");
  const sig = get("sig");
  if (
    did === null ||
    did.length === 0 ||
    tsRaw === null ||
    nonce === null ||
    nonce.length === 0 ||
    sig === null ||
    sig.length === 0
  ) {
    return undefined;
  }
  const timestampMs = Number.parseInt(tsRaw, 10);
  if (!Number.isFinite(timestampMs) || timestampMs < 0) return undefined;
  return { did, timestampMs, nonce, signatureB64Url: sig };
}

/** Parse the envelope from request headers (`X-Agent-*`). Returns undefined if any field is missing. */
export function parseAgentRequestEnvelopeFromHeaders(
  headers: Headers,
): AgentRequestEnvelope | undefined {
  return parseEnvelopeFromGetters((k) => {
    switch (k) {
      case "ts":
        return headers.get(AGENT_REQUEST_HEADER.ts);
      case "nonce":
        return headers.get(AGENT_REQUEST_HEADER.nonce);
      case "sig":
        return headers.get(AGENT_REQUEST_HEADER.sig);
      default:
        return null;
    }
  }, headers.get(AGENT_REQUEST_HEADER.did));
}

/** Parse the envelope from URL search params (used for WebSocket upgrade). */
export function parseAgentRequestEnvelopeFromSearch(
  sp: URLSearchParams,
): AgentRequestEnvelope | undefined {
  return parseEnvelopeFromGetters((k) => sp.get(k), sp.get(AGENT_REQUEST_SEARCH.did));
}

function b64UrlToBytes(b64url: string): Uint8Array {
  const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decode the base64url signature from an envelope to raw bytes. */
export function envelopeSignatureBytes(env: AgentRequestEnvelope): Uint8Array {
  return b64UrlToBytes(env.signatureB64Url);
}

/** Generate a random base64url nonce (16 bytes -> 22 chars). */
export function randomAgentRequestNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** Encode raw signature bytes to base64url (no padding). */
export function signatureBytesToB64Url(bytes: Uint8Array): string {
  return bytesToBase64Url(bytes);
}
