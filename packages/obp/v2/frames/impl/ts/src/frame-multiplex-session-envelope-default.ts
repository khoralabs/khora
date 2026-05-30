import {
  checkpointWireFromSessionOps,
  type SessionOp,
  verifySessionOpsExtends,
} from "@khoralabs/obp-v2-session-impl";

import type { SessionEnvelopeSyncAdapter } from "./frame-multiplex-session-types";

/** Default adapter: v2 Merkle checkpoints + extends check (see {@link verifySessionOpsExtends}). */
export function defaultSessionEnvelopeSyncAdapter(): SessionEnvelopeSyncAdapter {
  return {
    checkpointFromOps: (ops) => checkpointWireFromSessionOps(ops),
    verifyExtends: (args) => {
      const r = verifySessionOpsExtends({
        baseOps: args.baseOps as SessionOp[],
        deltaOps: args.deltaOps,
        claimed: args.claimed,
      });
      if (!r.ok) return { ok: false, error: { code: r.error.code } };
      return { ok: true, checkpoint: r.checkpoint };
    },
  };
}
