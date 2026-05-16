import { createHash, randomBytes } from "node:crypto";
import * as nodeCrypto from "node:crypto";

import type { ContentHash, PointerRef } from "./colonnade-types.ts";

const HASH_RE = /^[0-9a-f]{64}$/;

type CryptoWithHash = typeof nodeCrypto & {
  hash?: (algorithm: string, data: Uint8Array | Buffer, outputEncoding: "hex") => string;
};

const cryptoHashSync = (nodeCrypto as CryptoWithHash).hash;

/** Prefer Node/Bun single-shot SHA-256 when available (fewer allocations than streaming Hash). */
export function sha256HexLower(bytes: Uint8Array): string {
  if (typeof cryptoHashSync === "function") {
    return cryptoHashSync("sha256", bytes, "hex");
  }
  return createHash("sha256").update(bytes).digest("hex");
}

/** Decode a 64-char lowercase hex ContentHash to 32 raw digest bytes (for compact SQLite blobs). */
export function contentHashHexToBytes(hex: string): Uint8Array {
  assertContentHash(hex);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Encode 32-byte digest to lowercase hex ContentHash. */
export function contentHashBytesToHex(bytes: Uint8Array): string {
  if (bytes.byteLength !== 32) {
    throw new Error("Colonnade: content hash bytes must be length 32");
  }
  let s = "";
  for (let i = 0; i < 32; i++) {
    const b = bytes[i];
    if (b === undefined) {
      throw new Error("Colonnade: content hash bytes must be length 32");
    }
    s += (b & 0xff).toString(16).padStart(2, "0");
  }
  assertContentHash(s);
  return s;
}

/** Deterministic JSON for stable content-addressed catalog rows (sorted object keys, recursively). */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number" || t === "boolean") return JSON.stringify(value);
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (t === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Canonical UTF-8 bytes for **`UpsertSourceMapPointerRow`** / **`ComputeSourceRowContentHash`** binding `v: 1`. */
export function canonicalSourceMapRowBytes(params: {
  tenant_key: string;
  source_map_id: string;
  entry_key: string;
  pointer: PointerRef;
  projection: unknown;
}): Uint8Array {
  const obj = {
    v: 1,
    tenant_key: params.tenant_key,
    source_map_id: params.source_map_id,
    entry_key: params.entry_key,
    pointer: {
      source_cell_id: params.pointer.source_cell_id,
      source_record_key: params.pointer.source_record_key,
      content_hash: params.pointer.content_hash,
    },
    projection: params.projection,
  };
  return new TextEncoder().encode(stableStringify(obj));
}

export function assertContentHash(hash: string): asserts hash is ContentHash {
  if (!HASH_RE.test(hash)) {
    throw new Error(`Colonnade: invalid ContentHash (expected 64 lowercase hex chars)`);
  }
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}
