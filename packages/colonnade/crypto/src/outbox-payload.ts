import { SqliteCryptoError } from "@khoralabs/sqlite-crypto";

export const OUTBOX_ENVELOPE_MAGIC = "khora/outbox/v1" as const;
export const OUTBOX_ENVELOPE_V1 = 1 as const;
export const OUTBOX_ENVELOPE_ALG = "A256GCM" as const;

export type OutboxEnvelopeV1 = {
  v: typeof OUTBOX_ENVELOPE_V1;
  alg: typeof OUTBOX_ENVELOPE_ALG;
  iv: string;
  ct: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
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

function u8ToArrayBuffer(u: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(u.byteLength);
  out.set(u);
  return out.buffer;
}

export function isOutboxEncryptedPayload(bytes: Uint8Array): boolean {
  if (bytes.length < OUTBOX_ENVELOPE_MAGIC.length) return false;
  const prefix = new TextDecoder().decode(bytes.subarray(0, OUTBOX_ENVELOPE_MAGIC.length));
  return prefix === OUTBOX_ENVELOPE_MAGIC;
}

function parseEnvelopeJson(bytes: Uint8Array): OutboxEnvelopeV1 {
  const text = new TextDecoder().decode(bytes.subarray(OUTBOX_ENVELOPE_MAGIC.length));
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new SqliteCryptoError("outbox envelope: invalid JSON after magic prefix");
  }
  if (!isRecord(parsed)) {
    throw new SqliteCryptoError("outbox envelope: body must be a JSON object");
  }
  if (parsed.v !== OUTBOX_ENVELOPE_V1) {
    throw new SqliteCryptoError("outbox envelope: unsupported version");
  }
  if (parsed.alg !== OUTBOX_ENVELOPE_ALG) {
    throw new SqliteCryptoError("outbox envelope: unsupported algorithm");
  }
  if (typeof parsed.iv !== "string" || typeof parsed.ct !== "string") {
    throw new SqliteCryptoError("outbox envelope: iv/ct must be base64 strings");
  }
  return parsed as OutboxEnvelopeV1;
}

export async function encryptOutboxPayload(
  plaintext: Uint8Array,
  keyBytes: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    u8ToArrayBuffer(normalizeAesKey(keyBytes)),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: u8ToArrayBuffer(iv) },
      cryptoKey,
      u8ToArrayBuffer(plaintext),
    ),
  );
  const envelope: OutboxEnvelopeV1 = {
    v: OUTBOX_ENVELOPE_V1,
    alg: OUTBOX_ENVELOPE_ALG,
    iv: b64Encode(iv),
    ct: b64Encode(ct),
  };
  const body = new TextEncoder().encode(JSON.stringify(envelope));
  const magic = new TextEncoder().encode(OUTBOX_ENVELOPE_MAGIC);
  const out = new Uint8Array(magic.length + body.length);
  out.set(magic, 0);
  out.set(body, magic.length);
  return out;
}

export async function decryptOutboxPayload(
  stored: Uint8Array,
  keyBytes: Uint8Array,
): Promise<Uint8Array> {
  if (!isOutboxEncryptedPayload(stored)) {
    throw new SqliteCryptoError("outbox payload is not encrypted");
  }
  const wrap = parseEnvelopeJson(stored);
  const iv = b64Decode(wrap.iv);
  const ct = b64Decode(wrap.ct);
  if (iv.length !== 12) {
    throw new SqliteCryptoError("outbox envelope: iv must decode to 12 bytes");
  }
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    u8ToArrayBuffer(normalizeAesKey(keyBytes)),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: u8ToArrayBuffer(iv) },
      cryptoKey,
      u8ToArrayBuffer(ct),
    );
  } catch {
    throw new SqliteCryptoError("outbox envelope: decrypt failed (bad key or ciphertext)");
  }
  return new Uint8Array(pt);
}

function normalizeAesKey(keyBytes: Uint8Array): Uint8Array {
  if (keyBytes.length === 32) return keyBytes;
  if (keyBytes.length > 32) return keyBytes.subarray(0, 32);
  throw new SqliteCryptoError("outbox encryption key must be at least 32 bytes");
}

export function outboxKeyBytesToHex(keyBytes: Uint8Array): string {
  return [...keyBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function outboxMetadataIsPost(metadata: unknown): boolean {
  if (!isRecord(metadata)) return false;
  const postId = metadata.postId;
  return typeof postId === "string" && postId.length > 0;
}

export type OutboxPayloadCodec = {
  encryptIfPost(metadata: unknown, plaintext: Uint8Array): Promise<Uint8Array>;
  decrypt(stored: Uint8Array): Promise<Uint8Array>;
};

export function createOutboxPayloadCodec(keyBytes: Uint8Array): OutboxPayloadCodec {
  return {
    async encryptIfPost(metadata, plaintext) {
      if (!outboxMetadataIsPost(metadata)) return plaintext;
      return encryptOutboxPayload(plaintext, keyBytes);
    },
    async decrypt(stored) {
      return decryptOutboxPayload(stored, keyBytes);
    },
  };
}
