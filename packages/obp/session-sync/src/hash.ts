import { createHash } from "node:crypto";

const enc = new TextEncoder();

/** ASCII + NUL leaf prefix; normative definition in `packages/obp/persistence/spec/model/session-protocol.smithy`. */
export const SESSION_LEAF_V1_PREFIX = "OBP_SESSION_LEAF_v1\0";

/** UTF-8 body after **`SESSION_LEAF_V1_PREFIX`** when the op log has zero entries (same Smithy model). */
export const SESSION_EMPTY_LOG_SENTINEL = "__empty_session_op_log__";

/** `SHA-256(SESSION_LEAF_V1_PREFIX || canonicalUtf8)` per **`cfd.obp.session#NegotiationSessionProtocol`**. */
export function leafHash(canonicalUtf8: string): Uint8Array {
  const payload = new Uint8Array(enc.encode(`${SESSION_LEAF_V1_PREFIX}${canonicalUtf8}`));
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
