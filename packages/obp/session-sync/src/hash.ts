import { createHash } from "node:crypto";

const enc = new TextEncoder();

/** Domain-separated leaf hash (`OBP_SESSION_LEAF_v1` + canonical UTF-8). */
export function leafHash(canonicalUtf8: string): Uint8Array {
  const payload = new Uint8Array(enc.encode(`OBP_SESSION_LEAF_v1\0${canonicalUtf8}`));
  return sha256(payload);
}

/** Internal Merkle node: `0x01 || left || right` (32-byte digests each). */
export function internalHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + left.length + right.length);
  out[0] = 1;
  out.set(left, 1);
  out.set(right, 1 + left.length);
  return sha256(out);
}

export function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

export function bytesToHex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase().replace(/^0x/, "");
  if (clean.length % 2 !== 0) {
    throw new RangeError("hexToBytes: odd-length hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
