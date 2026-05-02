import { bytesToHex } from "./hash.ts";
import { leafHashForOp, merkleRoot } from "./merkle.ts";

export type Checkpoint = {
  /** Number of canonical ops covered by **`root_hex`** (prefix length). */
  seq: number;
  root_hex: string;
};

export type VerifyError =
  | { code: "SEQ_MISMATCH"; expected: number; actual: number }
  | { code: "ROOT_MISMATCH"; expectedHex: string; recomputedHex: string };

export function checkpointFromOps(ops: unknown[]): Checkpoint {
  const leaves = ops.map(leafHashForOp);
  const root = merkleRoot(leaves);
  return { seq: ops.length, root_hex: bytesToHex(root) };
}

/**
 * Confirms **`claimed`** matches **`baseOps || deltaOps`** (full replay prefix commitment).
 */
export function verifyExtends(args: {
  baseOps: unknown[];
  deltaOps: unknown[];
  claimed: Checkpoint;
}): { ok: true; checkpoint: Checkpoint } | { ok: false; error: VerifyError } {
  const full = [...args.baseOps, ...args.deltaOps];
  if (full.length !== args.claimed.seq) {
    return {
      ok: false,
      error: { code: "SEQ_MISMATCH", expected: args.claimed.seq, actual: full.length },
    };
  }
  const cp = checkpointFromOps(full);
  if (cp.root_hex !== args.claimed.root_hex) {
    return {
      ok: false,
      error: {
        code: "ROOT_MISMATCH",
        expectedHex: args.claimed.root_hex,
        recomputedHex: cp.root_hex,
      },
    };
  }
  return { ok: true, checkpoint: cp };
}
