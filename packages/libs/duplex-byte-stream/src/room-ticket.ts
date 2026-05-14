function bytesToHex(buf: Uint8Array): string {
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Copy bytes into a standalone `ArrayBuffer` so WebCrypto accepts `BufferSource` under strict TS. */
function uint8ArrayToDetachedArrayBuffer(u: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u.byteLength);
  copy.set(u);
  return copy.buffer;
}

export function generateRoomSecretHex(byteLength = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToHex(raw);
}

function toB64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64Url(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

async function importHmacKey(secretHex: string): Promise<CryptoKey> {
  const keyMaterial = Uint8Array.from(Buffer.from(secretHex, "hex"));
  return crypto.subtle.importKey(
    "raw",
    uint8ArrayToDetachedArrayBuffer(keyMaterial),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function roomIdPayloadBytes(roomId: string): Uint8Array {
  return new TextEncoder().encode(roomId);
}

/**
 * HMAC-SHA256(utf8(roomId)). Relay-scoped join proof; no OBP types.
 * Wire: base64url(payload).base64url(sig)
 */
export async function signRoomTicket(roomId: string, secretHex: string): Promise<string> {
  const payloadBytes = roomIdPayloadBytes(roomId);
  const key = await importHmacKey(secretHex);
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    uint8ArrayToDetachedArrayBuffer(payloadBytes),
  );
  return `${toB64Url(payloadBytes)}.${toB64Url(new Uint8Array(sigBuf))}`;
}

export async function verifyRoomTicket(
  roomId: string,
  ticket: string,
  secretHex: string,
): Promise<boolean> {
  const dot = ticket.indexOf(".");
  if (dot < 1) return false;
  const payloadB64 = ticket.slice(0, dot);
  const sigB64 = ticket.slice(dot + 1);
  if (payloadB64 === "" || sigB64 === "") return false;
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = fromB64Url(payloadB64);
    sigBytes = fromB64Url(sigB64);
  } catch {
    return false;
  }
  const expected = roomIdPayloadBytes(roomId);
  if (payloadBytes.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (payloadBytes[i] !== expected[i]) return false;
  }
  const key = await importHmacKey(secretHex);
  return crypto.subtle.verify(
    "HMAC",
    key,
    uint8ArrayToDetachedArrayBuffer(sigBytes),
    uint8ArrayToDetachedArrayBuffer(payloadBytes),
  );
}
