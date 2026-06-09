import { verifyAsync } from "@noble/ed25519";

export const AGENT_REQUEST_HEADER = {
  did: "X-Agent-Did",
  ts: "X-Agent-Timestamp",
  nonce: "X-Agent-Nonce",
  sig: "X-Agent-Signature",
} as const;

export const AGENT_REQUEST_FRESHNESS_WINDOW_MS = 60_000;

export type AgentRequestEnvelope = {
  did: string;
  timestampMs: number;
  nonce: string;
  signatureB64Url: string;
};

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i] as number);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(b64url: string): Uint8Array {
  const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256B64Url(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase64Url(new Uint8Array(buf));
}

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

export function canonicalAgentRequestPath(
  pathname: string,
  searchParams: URLSearchParams,
  allowedKeys: readonly string[],
): string {
  const out = new URLSearchParams();
  for (const key of allowedKeys) {
    for (const v of searchParams.getAll(key)) {
      out.append(key, v);
    }
  }
  const qs = out.toString();
  return qs.length > 0 ? `${pathname}?${qs}` : pathname;
}

function parseEnvelopeFromHeaders(headers: Headers): AgentRequestEnvelope | undefined {
  const did = headers.get(AGENT_REQUEST_HEADER.did)?.trim();
  const tsRaw = headers.get(AGENT_REQUEST_HEADER.ts);
  const nonce = headers.get(AGENT_REQUEST_HEADER.nonce);
  const sig = headers.get(AGENT_REQUEST_HEADER.sig);
  if (
    did === undefined ||
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

function base58Decode(input: string): Uint8Array {
  const bytes: number[] = [0];
  for (const ch of input) {
    const val = BASE58_ALPHABET.indexOf(ch);
    if (val < 0) throw new Error("invalid base58");
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      const n = (bytes[j] as number) * 58 + carry;
      bytes[j] = n % 256;
      carry = Math.floor(n / 256);
    }
    while (carry > 0) {
      bytes.push(carry % 256);
      carry = Math.floor(carry / 256);
    }
  }
  let zeros = 0;
  for (const ch of input) {
    if (ch === "1") zeros++;
    else break;
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[out.length - 1 - i] = bytes[i] as number;
  }
  return out;
}

function ed25519PublicKeyFromDid(did: string): Uint8Array {
  const didKeyPrefix = "did:key:";
  if (!did.startsWith(didKeyPrefix)) {
    throw new AuthError(`unsupported DID: ${did}`, 401);
  }
  const multibase = did.slice(didKeyPrefix.length);
  if (!multibase.startsWith("z")) {
    throw new AuthError(`unsupported DID multibase: ${did}`, 401);
  }
  const decoded = base58Decode(multibase.slice(1));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new AuthError(`unsupported did:key multicodec: ${did}`, 401);
  }
  return decoded.slice(2);
}

type NonceEntry = { expiresAtMs: number };

export function createInMemoryNonceStore() {
  const seen = new Map<string, NonceEntry>();
  return {
    tryInsert(entry: { did: string; nonce: string; expiresAtMs: number }): boolean {
      const key = `${entry.did}\0${entry.nonce}`;
      if (seen.has(key)) return false;
      seen.set(key, { expiresAtMs: entry.expiresAtMs });
      return true;
    },
    sweepExpired(nowMs: number): void {
      for (const [k, v] of seen) {
        if (v.expiresAtMs <= nowMs) seen.delete(k);
      }
    },
  };
}

export type ChannelRelayAuth = ReturnType<typeof createChannelRelayAuth>;

export function createChannelRelayAuth(opts?: { now?: () => number; freshnessWindowMs?: number }) {
  const now = opts?.now ?? (() => Date.now());
  const freshnessWindowMs = opts?.freshnessWindowMs ?? AGENT_REQUEST_FRESHNESS_WINDOW_MS;
  const nonceStore = createInMemoryNonceStore();

  async function requireAuthenticatedRequest(
    req: Request,
    url: URL,
    bodyText = "",
    signedQueryKeys: readonly string[] = [],
  ): Promise<{ did: string }> {
    const did = req.headers.get(AGENT_REQUEST_HEADER.did)?.trim();
    if (did === undefined || did.length === 0) {
      throw new AuthError(`${AGENT_REQUEST_HEADER.did} header required`, 400);
    }
    const envelope = parseEnvelopeFromHeaders(req.headers);
    if (envelope === undefined) {
      throw new AuthError("missing agent request signature", 401);
    }
    if (envelope.did !== did) {
      throw new AuthError("agent DID mismatch", 401);
    }
    const t = now();
    if (Math.abs(t - envelope.timestampMs) > freshnessWindowMs) {
      throw new AuthError("agent request timestamp out of window", 401);
    }
    nonceStore.sweepExpired(t);
    const inserted = nonceStore.tryInsert({
      did: envelope.did,
      nonce: envelope.nonce,
      expiresAtMs: envelope.timestampMs + freshnessWindowMs,
    });
    if (!inserted) {
      throw new AuthError("agent request nonce reuse", 401);
    }
    const path = canonicalAgentRequestPath(url.pathname, url.searchParams, signedQueryKeys);
    const message = await canonicalAgentRequestMessage({
      method: req.method,
      path,
      timestampMs: envelope.timestampMs,
      nonce: envelope.nonce,
      bodyText,
    });
    const pubKey = ed25519PublicKeyFromDid(envelope.did);
    const ok = await verifyAsync(b64UrlToBytes(envelope.signatureB64Url), message, pubKey);
    if (!ok) {
      throw new AuthError("agent request signature invalid", 401);
    }
    return { did };
  }

  return { requireAuthenticatedRequest, nonceStore };
}
