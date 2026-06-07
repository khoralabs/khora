import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import type { ObpPersistenceClient } from "@khoralabs/obp-persistence";
import type { SessionOp } from "@khoralabs/obp-session-impl";
import { canonicalSessionParties } from "./frame-init-wire";
import {
  runFrameMultiplexSession,
  type SessionEnvelopeSyncAdapter,
} from "./frame-multiplex-session";
import type { FrameSessionHandlers } from "./frame-mux-types";
import type { SessionInitNormalized } from "./frame-protocol-types";
import type { FrameSigner, FrameVerifier } from "./frame-signer";

export type { SessionEnvelopeSyncAdapter } from "./frame-multiplex-session";

export type RunFrameSessionArgs = {
  sendInit?: boolean;
  channel: DuplexByteStream;
  signer: FrameSigner;
  verifier: FrameVerifier;
  client: ObpPersistenceClient;
  init: SessionInitNormalized;
  handlers: FrameSessionHandlers;
  sessionEnvelopeSync?: SessionEnvelopeSyncAdapter;
};

/** Single-chain bilateral session (one {@link SessionInitNormalized}); stream closes after TERMINATE when configured. */
export async function runFrameSession(args: RunFrameSessionArgs): Promise<SessionOp[]> {
  const {
    sendInit = false,
    channel,
    signer,
    verifier,
    client,
    init,
    handlers,
    sessionEnvelopeSync,
  } = args;

  return runFrameMultiplexSession({
    channel,
    signer,
    verifier,
    client,
    sessionTemplate: {
      parties: canonicalSessionParties([init.parties[0], init.parties[1]]),
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
} from "./frame-multiplex-session";
