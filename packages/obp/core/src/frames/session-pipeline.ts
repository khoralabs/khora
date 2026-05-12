import type { FrameChannel } from "@khoralabs/frame-channel";
import type { ObpPersistence } from "../persistence/client/persistence-types.ts";
import {
  runFrameMultiplexSession,
  type SessionEnvelopeSyncAdapter,
} from "./multiplex-frame-session.ts";
import type { FrameSigner, FrameVerifier } from "./signer.ts";
import type { SessionOp } from "./to-session-op.ts";
import type { FrameSessionHandlers, SessionInit } from "./types.ts";

export type { SessionEnvelopeSyncAdapter } from "./multiplex-frame-session.ts";

export type RunFrameSessionArgs = {
  /** When true, send `init` on the wire before reading (uses same {@link RunFrameSessionArgs.init}). Default false when omitted. */
  sendInit?: boolean;
  channel: FrameChannel;
  signer: FrameSigner;
  verifier: FrameVerifier;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  init: SessionInit;
  handlers: FrameSessionHandlers;
  /** When set, multiplex `session_envelope` on the same stream (after frames); ops must match frame-derived log. */
  sessionEnvelopeSync?: SessionEnvelopeSyncAdapter;
};

/**
 * Single-chain bilateral session: one {@link SessionInit}, stream closes after TERMINATE or when idle after sending `init`.
 * Implemented via {@link runFrameMultiplexSession} with at most one outbound `init` plan and **`closeChannelOnTerminate: true`**.
 */
export async function runFrameSession(args: RunFrameSessionArgs): Promise<SessionOp[]> {
  const {
    sendInit = false,
    channel,
    signer,
    verifier,
    persistence,
    ledgerSeq,
    init,
    handlers,
    sessionEnvelopeSync,
  } = args;

  return runFrameMultiplexSession({
    channel,
    signer,
    verifier,
    persistence,
    ledgerSeq,
    sessionTemplate: {
      parties: init.parties,
    },
    handlers,
    ...(sessionEnvelopeSync !== undefined ? { sessionEnvelopeSync } : {}),
    initiatorChainPlans: sendInit ? [{ init }] : [],
    closeChannelOnTerminate: true,
    closeChannelWhenIdle: true,
  });
}

export {
  type RunFrameMultiplexSessionArgs,
  runFrameMultiplexSession,
} from "./multiplex-frame-session.ts";
