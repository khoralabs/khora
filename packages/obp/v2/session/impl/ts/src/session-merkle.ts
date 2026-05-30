/**
 * Merkle / checkpoint helpers per `NegotiationSessionProtocol` in
 * `packages/obp/v2/session/spec/model/session-protocol.smithy`.
 */

import { createHash } from "node:crypto";
import { canonicalJsonString } from "@khoralabs/obp-v2-frames-impl";
import {
  type Checkpoint,
  type SessionOp,
  type Sha256HexLower,
  toSha256HexLower,
} from "./session-protocol-types";

const LEAF_TAG = new TextEncoder().encode("OBP_SESSION_LEAF_v1");
const NUL = new Uint8Array([0]);
const EMPTY_LOG_LITERAL = new TextEncoder().encode("__empty_session_op_log__");

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function bytesToHexLower(digest: Uint8Array): Sha256HexLower {
  let s = "";
  for (let i = 0; i < digest.length; i++) {
    const b = digest[i];
    if (b === undefined) {
      throw new Error("unexpected end of digest");
    }
    s += b.toString(16).padStart(2, "0");
  }
  return toSha256HexLower(s);
}

/** Leaf hash `L_i = SHA-256(LEAF_PREFIX)` with `LEAF_PREFIX = OBP_SESSION_LEAF_v1 || NUL || UTF-8(canonical_json(op))`. */
export function sessionOpLeafDigest(op: SessionOp): Uint8Array {
  const jsonUtf8 = new TextEncoder().encode(canonicalJsonString(op));
  return sha256(concat(LEAF_TAG, NUL, jsonUtf8));
}

/** Root for `n = 0` ops: same prefix construction with literal `__empty_session_op_log__` (not `canonical_json`). */
export function emptySessionOpLogRootHex(): Sha256HexLower {
  return bytesToHexLower(sha256(concat(LEAF_TAG, NUL, EMPTY_LOG_LITERAL)));
}

/** Internal node: `SHA-256(0x01 || left || right)` (32-byte children). */
export function merkleInternalDigest(left: Uint8Array, right: Uint8Array): Uint8Array {
  const prefix = new Uint8Array([0x01]);
  return sha256(concat(prefix, left, right));
}

/**
 * Binary Merkle reduction left-to-right within each level; odd level length duplicates the last leaf
 * (pairs with itself), per spec.
 */
export function merkleRootHexFromLeafDigests(leafDigests: readonly Uint8Array[]): Sha256HexLower {
  if (leafDigests.length === 0) {
    return emptySessionOpLogRootHex();
  }
  let level = [...leafDigests];
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      if (left === undefined || right === undefined) {
        throw new Error("merkle level invariant");
      }
      next.push(merkleInternalDigest(left, right));
    }
    level = next;
  }
  const root = level[0];
  if (root === undefined) {
    throw new Error("merkle root invariant");
  }
  return bytesToHexLower(root);
}

/** `Checkpoint` for the given ordered ops (`seq === n`, root over `op_0 … op_{n-1}`). */
export function checkpointForSessionOps(ops: readonly SessionOp[]): Checkpoint {
  const n = BigInt(ops.length);
  if (n === 0n) {
    return { seq: 0n, root_hex: emptySessionOpLogRootHex() };
  }
  const leaves = ops.map(sessionOpLeafDigest);
  return { seq: n, root_hex: merkleRootHexFromLeafDigests(leaves) };
}
