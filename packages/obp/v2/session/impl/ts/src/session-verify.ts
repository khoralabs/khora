/**
 * `SessionEnvelope` verification using `VerifyError` from
 * `packages/obp/v2/session/spec/model/session-protocol.smithy`.
 */

import { checkpointForSessionOps } from "./session-merkle.ts";
import type {
  Checkpoint,
  RootMismatchError,
  SeqMismatchError,
  SessionEnvelope,
  SessionOp,
  VerifyError,
} from "./session-protocol-types.ts";

function checkpointsEqual(a: Checkpoint, b: Checkpoint): boolean {
  return a.seq === b.seq && a.root_hex === b.root_hex;
}

/**
 * Verifies an inbound `SessionEnvelope` against the verifier's local agreed prefix.
 *
 * - `local_ops` must be exactly `op_0 … op_{base.seq-1}` and hash to `base.root_hex`.
 * - On success, returns `undefined`. On failure, returns a `VerifyError` union member; callers MUST NOT partially apply `delta_ops`.
 */
export function verifySessionEnvelope(
  local_ops: readonly SessionOp[],
  envelope: SessionEnvelope,
): VerifyError | undefined {
  const expectedBase = checkpointForSessionOps(local_ops);
  if (!checkpointsEqual(expectedBase, envelope.base_checkpoint)) {
    if (expectedBase.seq !== envelope.base_checkpoint.seq) {
      const err: SeqMismatchError = {
        expected: expectedBase.seq,
        actual: envelope.base_checkpoint.seq,
      };
      return { seqMismatch: err };
    }
    const err: RootMismatchError = {
      expected_hex: envelope.base_checkpoint.root_hex,
      recomputed_hex: expectedBase.root_hex,
    };
    return { rootMismatch: err };
  }

  const combined: SessionOp[] = [...local_ops, ...envelope.delta_ops];
  const recomputed = checkpointForSessionOps(combined);
  if (!checkpointsEqual(recomputed, envelope.new_checkpoint)) {
    if (recomputed.seq !== envelope.new_checkpoint.seq) {
      return {
        seqMismatch: {
          expected: recomputed.seq,
          actual: envelope.new_checkpoint.seq,
        },
      };
    }
    return {
      rootMismatch: {
        expected_hex: envelope.new_checkpoint.root_hex,
        recomputed_hex: recomputed.root_hex,
      },
    };
  }
  return undefined;
}
