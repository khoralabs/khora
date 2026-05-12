import {
  canonicalJsonUtf8,
  type SessionInit,
  sessionInitFromWire,
  sessionInitToWire,
} from "@khoralabs/obp-core";

function bytesToHex(buf: Uint8Array): string {
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generatePairingSecretHex(byteLength = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToHex(raw);
}

function toB64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64Url(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

async function importHmacKey(pairingSecretHex: string): Promise<CryptoKey> {
  const keyMaterial = Uint8Array.from(Buffer.from(pairingSecretHex, "hex"));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** HMAC-SHA256(canonical_utf8(SessionInit)). Returns token without `Bearer `. */
export async function signPairingTicket(
  init: SessionInit,
  pairingSecretHex: string,
): Promise<string> {
  const payloadBytes = canonicalJsonUtf8(sessionInitToWire(init) as unknown);
  const key = await importHmacKey(pairingSecretHex);
  const sigBuf = await crypto.subtle.sign("HMAC", key, payloadBytes);
  return `${toB64Url(payloadBytes)}.${toB64Url(new Uint8Array(sigBuf))}`;
}

export async function verifyPairingTicket(
  ticket: string,
  pairingSecretHex: string,
): Promise<SessionInit | null> {
  const dot = ticket.indexOf(".");
  if (dot < 1) return null;
  const payloadB64 = ticket.slice(0, dot);
  const sigB64 = ticket.slice(dot + 1);
  if (payloadB64 === "" || sigB64 === "") return null;
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = fromB64Url(payloadB64);
    sigBytes = fromB64Url(sigB64);
  } catch {
    return null;
  }
  const key = await importHmacKey(pairingSecretHex);
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, payloadBytes);
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
    typeof o.session_id !== "string" ||
    !Array.isArray(o.party_ids) ||
    o.party_ids.length !== 2 ||
    !Array.isArray(o.actor_pubkeys) ||
    o.actor_pubkeys.length !== 2 ||
    typeof o.genesis_hash !== "string"
  ) {
    return null;
  }
  return sessionInitFromWire({
    session_id: String(o.session_id),
    party_ids: [String(o.party_ids[0]), String(o.party_ids[1])],
    actor_pubkeys: [String(o.actor_pubkeys[0]), String(o.actor_pubkeys[1])],
    genesis_hash: String(o.genesis_hash),
  });
}
