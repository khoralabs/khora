/**
 * Frame-channel E2EE: X25519 handshake + HKDF + AES-256-GCM for logical `Frame.body`.
 * @see ../docs/FRAME_CHANNEL_E2EE.md
 */

import { x25519 } from "@noble/curves/ed25519.js";
import { ObpError } from "@khoralabs/obp-v2-errors";

import { canonicalJsonString } from "./canonical-json.ts";

export const E2EE_HS_BODY_KEY = "e2ee_hs" as const;
export const E2EE_WIRE_BODY_KEY = "e2ee" as const;
export const FRAME_E2EE_PROFILE_V1 = 1 as const;
export const FRAME_E2EE_A256GCM = "A256GCM" as const;

const HKDF_INFO_PREFIX = "khora/obp-frame-e2ee/v1";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function ephemeralX25519Keygen(): { sk: Uint8Array; pk: Uint8Array } {
  const sk = x25519.utils.randomSecretKey();
  return { sk, pk: x25519.getPublicKey(sk) };
}

export function x25519SharedSecret(localSk: Uint8Array, remotePk: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(localSk, remotePk);
}

export function bytesToHexLower(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const HEX = /^[0-9a-f]+$/;

export function hexToBytes32(hex: string, field: string): Uint8Array {
  const h = hex.trim().toLowerCase();
  if (h.length !== 64 || !HEX.test(h)) {
    throw new ObpError("VALIDATION", `${field}: expected 64-char hex (32 bytes)`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** First handshake `END_OFFERS` must be from this actor (lex-min Ed25519 pubkey hex). */
export function minActorPubkeyFromInit(parties: readonly { pubkey: string }[]): string {
  if (parties.length !== 2) {
    throw new ObpError("VALIDATION", "E2EE handshake expects exactly two parties");
  }
  const p0 = parties[0];
  const p1 = parties[1];
  if (p0 === undefined || p1 === undefined) {
    throw new ObpError("VALIDATION", "E2EE handshake expects exactly two parties");
  }
  const ak = p0.pubkey;
  const bk = p1.pubkey;
  return ak < bk ? ak : bk;
}

export function isE2eeHandshakeBody(body: unknown): boolean {
  if (!isRecord(body)) return false;
  const hs = body[E2EE_HS_BODY_KEY];
  if (!isRecord(hs)) return false;
  const v = hs.v;
  return v === FRAME_E2EE_PROFILE_V1 && typeof hs.ephemeral_pub_hex === "string";
}

export function handshakeBodyFromEphemeralPub(pk: Uint8Array): Record<string, unknown> {
  return {
    [E2EE_HS_BODY_KEY]: {
      v: FRAME_E2EE_PROFILE_V1,
      ephemeral_pub_hex: bytesToHexLower(pk),
    },
  };
}

export function parseHandshakeEphemeralPub(body: Record<string, unknown>): Uint8Array {
  const hs = body[E2EE_HS_BODY_KEY];
  if (!isRecord(hs)) throw new ObpError("VALIDATION", "E2EE: missing e2ee_hs");
  if (hs.v !== FRAME_E2EE_PROFILE_V1) {
    throw new ObpError("VALIDATION", "E2EE: unsupported e2ee_hs.v");
  }
  const hex = hs.ephemeral_pub_hex;
  if (typeof hex !== "string") {
    throw new ObpError("VALIDATION", "E2EE: e2ee_hs.ephemeral_pub_hex must be string");
  }
  return hexToBytes32(hex, "ephemeral_pub_hex");
}

function hkdfInfo(sessionId: string, channelBinding: string): Uint8Array {
  const sid = utf8(sessionId);
  const bind = utf8(channelBinding);
  const prefix = utf8(HKDF_INFO_PREFIX);
  return concatBytes(concatBytes(concatBytes(prefix, new Uint8Array([0])), sid), bind);
}

function u8ToArrayBuffer(u: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(u.byteLength);
  out.set(u);
  return out.buffer;
}

export async function deriveFrameBodyAesKey(args: {
  sharedSecret: Uint8Array;
  sessionId: string;
  channelBinding: string;
}): Promise<CryptoKey> {
  const ikmKey = await crypto.subtle.importKey(
    "raw",
    u8ToArrayBuffer(args.sharedSecret),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const raw = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: u8ToArrayBuffer(hkdfInfo(args.sessionId, args.channelBinding)),
    },
    ikmKey,
    256,
  );
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function b64Encode(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i++) {
    s += String.fromCharCode(u[i] ?? 0);
  }
  return btoa(s);
}

function b64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i) ?? 0;
  }
  return out;
}

export async function encryptLogicalFrameBody(
  aesKey: CryptoKey,
  logical: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const pt = utf8(canonicalJsonString(logical));
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: u8ToArrayBuffer(iv) }, aesKey, u8ToArrayBuffer(pt)),
  );
  return {
    [E2EE_WIRE_BODY_KEY]: {
      v: FRAME_E2EE_PROFILE_V1,
      alg: FRAME_E2EE_A256GCM,
      iv: b64Encode(iv),
      ct: b64Encode(ct),
    },
  };
}

export async function decryptWireFrameBody(
  aesKey: CryptoKey,
  wireBody: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (isE2eeHandshakeBody(wireBody)) {
    throw new ObpError("VALIDATION", "E2EE: handshake body passed to decrypt");
  }
  const wrap = wireBody[E2EE_WIRE_BODY_KEY];
  if (!isRecord(wrap)) {
    throw new ObpError("VALIDATION", "E2EE: missing e2ee wrapper on wire body");
  }
  if (wrap.v !== FRAME_E2EE_PROFILE_V1) {
    throw new ObpError("VALIDATION", "E2EE: unsupported e2ee.v");
  }
  if (wrap.alg !== FRAME_E2EE_A256GCM) {
    throw new ObpError("VALIDATION", "E2EE: unsupported e2ee.alg");
  }
  const ivs = wrap.iv;
  const cts = wrap.ct;
  if (typeof ivs !== "string" || typeof cts !== "string") {
    throw new ObpError("VALIDATION", "E2EE: e2ee iv/ct must be base64 strings");
  }
  const iv = b64Decode(ivs);
  const ct = b64Decode(cts);
  if (iv.length !== 12) {
    throw new ObpError("VALIDATION", "E2EE: iv must decode to 12 bytes");
  }
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u8ToArrayBuffer(iv) }, aesKey, u8ToArrayBuffer(ct));
  } catch {
    throw new ObpError("VALIDATION", "E2EE: decrypt failed (bad key or ciphertext)");
  }
  const text = new TextDecoder().decode(pt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new ObpError("VALIDATION", "E2EE: decrypted payload is not JSON");
  }
  if (!isRecord(parsed)) {
    throw new ObpError("VALIDATION", "E2EE: decrypted payload must be a JSON object");
  }
  return parsed;
}
