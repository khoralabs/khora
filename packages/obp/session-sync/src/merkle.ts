import { canonicalJson } from "./canonical.ts";
import { internalHash, leafHash } from "./hash.ts";

function pairReduceLevel(level: Uint8Array[]): Uint8Array[] {
  const next: Uint8Array[] = [];
  for (let i = 0; i < level.length; i += 2) {
    const left = level[i];
    if (left === undefined) {
      break;
    }
    const right = level[i + 1] ?? left;
    next.push(internalHash(left, right));
  }
  return next;
}

/**
 * Binary Merkle root over **`leaves`** (already hashed) using the **duplicate-last** odd rule
 * from [`decentralized-session.md`](../documentation/decentralized-session.md).
 */
export function merkleRoot(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 0) {
    return leafHash("__empty_session_op_log__");
  }
  let level = [...leaves];
  while (level.length > 1) {
    level = pairReduceLevel(level);
  }
  const root = level[0];
  if (root === undefined) {
    return leafHash("__empty_session_op_log__");
  }
  return root;
}

export function leafHashForOp(op: unknown): Uint8Array {
  return leafHash(canonicalJson(op));
}

export type MerkleLevels = Uint8Array[][];

/** Full reduction levels (for inclusion proofs). */
export function merkleLevels(leaves: Uint8Array[]): MerkleLevels {
  if (leaves.length === 0) {
    const root = leafHash("__empty_session_op_log__");
    return [[root]];
  }
  const levels: MerkleLevels = [[...leaves]];
  while (true) {
    const cur = levels.at(-1);
    if (cur === undefined || cur.length <= 1) {
      break;
    }
    levels.push(pairReduceLevel(cur));
  }
  return levels;
}

function siblingIndex(i: number, rowLen: number): number {
  if (i % 2 === 0) {
    return i + 1 < rowLen ? i + 1 : i;
  }
  return i - 1;
}

/** Sibling hashes from leaf row up to the row below root (standard Merkle proof). */
export function inclusionProof(leaves: Uint8Array[], leafIndex: number): Uint8Array[] {
  if (leaves.length === 0) {
    return [];
  }
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new RangeError("inclusionProof: leafIndex out of range");
  }
  const levels = merkleLevels(leaves);
  const proof: Uint8Array[] = [];
  let idx = leafIndex;
  for (let depth = 0; depth < levels.length - 1; depth++) {
    const row = levels[depth];
    if (row === undefined) {
      break;
    }
    const sib = siblingIndex(idx, row.length);
    const sibHash = row[sib];
    if (sibHash === undefined) {
      throw new RangeError("inclusionProof: missing sibling hash");
    }
    proof.push(sibHash);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function verifyInclusion(args: {
  root: Uint8Array;
  leafHash: Uint8Array;
  leafIndex: number;
  proof: Uint8Array[];
  leafCount: number;
}): boolean {
  const { root, leafHash: leafH, leafIndex, proof, leafCount } = args;
  if (leafCount === 0) {
    return timingSafeEqual(merkleRoot([]), root);
  }
  if (leafIndex < 0 || leafIndex >= leafCount) {
    return false;
  }
  let acc = leafH;
  let idx = leafIndex;
  let rowLen = leafCount;
  for (const sib of proof) {
    const isRight = idx % 2 === 1;
    acc = isRight ? internalHash(sib, acc) : internalHash(acc, sib);
    idx = Math.floor(idx / 2);
    rowLen = Math.ceil(rowLen / 2);
  }
  return timingSafeEqual(acc, root);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) {
      return false;
    }
    diff |= x ^ y;
  }
  return diff === 0;
}
