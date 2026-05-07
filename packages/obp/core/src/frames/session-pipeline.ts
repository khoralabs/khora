import type { ObpPersistence } from "../persistence/client/persistence-types.ts";
import type { FrameChannel } from "./channel.ts";
import { runFrameMultiplexSession } from "./multiplex-frame-session.ts";
import type { FrameSigner, FrameVerifier } from "./signer.ts";
import type { SessionOp } from "./to-session-op.ts";
import type { FrameSessionHandlers, SessionCheckpoint, SessionInit, TurnBody } from "./types.ts";

/** Injected Merkle helpers (from `@cfd/obp-session-sync` at the app layer; avoids core → session-sync cycle). */
export type SessionEnvelopeSyncAdapter = {
  myPartyId: string;
  checkpointFromOps: (ops: SessionOp[]) => SessionCheckpoint;
  verifyExtends: (args: {
    baseOps: unknown[];
    deltaOps: unknown[];
    claimed: SessionCheckpoint;
  }) => { ok: true; checkpoint: SessionCheckpoint } | { ok: false; error: { code: string } };
};

export type RunFrameSessionArgs = {
  role: "initiator" | "responder";
  channel: FrameChannel;
  signer: FrameSigner;
  verifier: FrameVerifier;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  init: SessionInit;
  handlers: FrameSessionHandlers;
  /** Initiator: first TURN after `init` (no `session.turn()` — only this path and {@link FrameSessionHandlers.onIncomingOffer} returns). */
  initialTurn?: TurnBody;
  /** When set, multiplex `session_envelope` on the same stream (after frames); ops must match frame-derived log. */
  sessionEnvelopeSync?: SessionEnvelopeSyncAdapter;
  /**
   * When each peer has its own {@link ObpPersistence}, set true so outbound TURN also
   * runs {@link applyTurn} locally (inbound already does). Default false keeps
   * shared-persistence setups from double-applying graph effects.
   */
  graphApplyOutbound?: boolean;
};

/**
 * Single-chain bilateral session: one {@link SessionInit}, stream closes after TERMINATE or when the initiator is idle.
 * Implemented via {@link runFrameMultiplexSession} with one initiator plan and **`closeChannelOnTerminate: true`**.
 */
export async function runFrameSession(args: RunFrameSessionArgs): Promise<SessionOp[]> {
  const {
    role,
    channel,
    signer,
    verifier,
    persistence,
    ledgerSeq,
    init,
    handlers,
    sessionEnvelopeSync,
    graphApplyOutbound,
    initialTurn,
  } = args;

  return runFrameMultiplexSession({
    role,
    channel,
    signer,
    verifier,
    persistence,
    ledgerSeq,
    sessionTemplate: {
      party_ids: init.party_ids,
      actor_pubkeys: init.actor_pubkeys,
    },
    handlers,
    ...(sessionEnvelopeSync !== undefined ? { sessionEnvelopeSync } : {}),
    ...(graphApplyOutbound === true ? { graphApplyOutbound: true } : {}),
    initiatorChainPlans:
      role === "initiator" ? [{ init, ...(initialTurn !== undefined ? { initialTurn } : {}) }] : [],
    closeChannelOnTerminate: true,
    closeChannelWhenIdle: true,
  });
}

export {
  type RunFrameMultiplexSessionArgs,
  runFrameMultiplexSession,
} from "./multiplex-frame-session.ts";
