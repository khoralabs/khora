import {
  canonicalJsonUtf8,
  type FrameSigner,
  importEd25519PublicKeyFromActorHex,
  normalizeSessionInit,
  type SessionInit,
  type SessionInitWire,
  sessionInitFromWire,
  sessionInitToWire,
} from "@khoralabs/obp-core";

function toB64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64Url(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

function hexToBytes(hex: string): Uint8Array {
  const HEX = /^[0-9a-f]*$/;
  if (hex.length % 2 !== 0 || !HEX.test(hex)) {
    throw new Error("invalid hex string");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateNonce(byteLength = 16): string {
  const raw = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToHex(raw);
}

export type ObpSessionInvitePayload = {
  session: SessionInitWire;
  nonce: string;
  issuedAt: number;
  expiresAt?: number;
};

export type SignInviteOptions = {
  nonce?: string;
  issuedAt?: number;
  expiresAt?: number;
};

/**
 * Server-signed bearer token: canonical JSON payload + Ed25519(signature).
 * Clients pin {@link serverActorHex}; verification proves the invite was issued by that key.
 */
export async function signInvite(
  init: SessionInit,
  signer: FrameSigner,
  opts?: SignInviteOptions,
): Promise<string> {
  const n = normalizeSessionInit(init);
  const payload: ObpSessionInvitePayload = {
    session: sessionInitToWire(n),
    nonce: opts?.nonce ?? generateNonce(),
    issuedAt: opts?.issuedAt ?? Date.now(),
    ...(opts?.expiresAt !== undefined ? { expiresAt: opts.expiresAt } : {}),
  };
  const payloadBytes = canonicalJsonUtf8(payload as unknown);
  const sigHex = await signer.sign(payloadBytes);
  const sigBytes = hexToBytes(sigHex);
  return `${toB64Url(payloadBytes)}.${toB64Url(sigBytes)}`;
}

export type VerifyInviteOptions = {
  nowMs?: number;
};

export async function verifyInvite(
  token: string,
  serverActorHex: string,
  opts?: VerifyInviteOptions,
): Promise<SessionInit | null> {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  if (payloadB64 === "" || sigB64 === "") return null;
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = fromB64Url(payloadB64);
    sigBytes = fromB64Url(sigB64);
  } catch {
    return null;
  }
  let pk: CryptoKey;
  try {
    pk = await importEd25519PublicKeyFromActorHex(serverActorHex);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("Ed25519", pk, sigBytes, payloadBytes);
  if (!ok) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(payloadBytes)) as unknown;
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.nonce !== "string" ||
    typeof o.issuedAt !== "number" ||
    !Number.isFinite(o.issuedAt) ||
    typeof o.session !== "object" ||
    o.session === null ||
    Array.isArray(o.session)
  ) {
    return null;
  }
  if (
    o.expiresAt !== undefined &&
    (typeof o.expiresAt !== "number" || !Number.isFinite(o.expiresAt))
  ) {
    return null;
  }
  const now = opts?.nowMs ?? Date.now();
  if (typeof o.expiresAt === "number" && now > o.expiresAt) return null;

  const s = o.session as Record<string, unknown>;
  if (
    typeof s.session_id !== "string" ||
    !Array.isArray(s.party_ids) ||
    s.party_ids.length !== 2 ||
    !Array.isArray(s.actor_pubkeys) ||
    s.actor_pubkeys.length !== 2 ||
    typeof s.genesis_hash !== "string"
  ) {
    return null;
  }
  const wire: SessionInitWire = {
    session_id: String(s.session_id),
    party_ids: [String(s.party_ids[0]), String(s.party_ids[1])],
    actor_pubkeys: [String(s.actor_pubkeys[0]), String(s.actor_pubkeys[1])],
    genesis_hash: String(s.genesis_hash),
  };
  const init = sessionInitFromWire(wire);
  const serverParty = init.parties.find((p) => p.pubkey === serverActorHex);
  if (serverParty === undefined) return null;
  return init;
}
