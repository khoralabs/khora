import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import type { NbcBindPolicyValidateFn } from "@khoralabs/obp-v2-nbc";
import type { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import type { SessionOp } from "@khoralabs/obp-v2-session-impl";

import type { FrameDag } from "./frame-dag.ts";
import type {
  FrameMultiplexOpenerApi,
  FrameSessionHandlers,
  MultiplexChainHooks,
} from "./frame-mux-types.ts";
import type { SessionEnvelopeWire, SessionInitNormalized } from "./frame-protocol-types.ts";
import type { FrameSigner, FrameVerifier } from "./frame-signer.ts";

export type SessionEnvelopeSyncAdapter = {
  myPartyId?: string;
  getMyPartyId?: () => string;
  checkpointFromOps: (ops: SessionOp[]) => SessionEnvelopeWire["base_checkpoint"];
  verifyExtends: (args: {
    baseOps: unknown[];
    deltaOps: unknown[];
    claimed: SessionEnvelopeWire["new_checkpoint"];
  }) =>
    | { ok: true; checkpoint: SessionEnvelopeWire["new_checkpoint"] }
    | { ok: false; error: { code: string } };
};

export type RunFrameMultiplexSessionArgs = {
  channel: DuplexByteStream;
  signer: FrameSigner;
  verifier: FrameVerifier;
  client: ObpPersistenceClient;
  sessionTemplate?: Pick<SessionInitNormalized, "parties">;
  handlers: FrameSessionHandlers;
  sessionEnvelopeSync?: SessionEnvelopeSyncAdapter;
  initiatorChainPlans?: Array<{ init: SessionInitNormalized }>;
  closeChannelOnTerminate?: boolean;
  closeChannelWhenIdle?: boolean;
  openerSession?: (api: FrameMultiplexOpenerApi) => Promise<void>;
  /** NBC N4 bind payload validation when inbound TURN carries an active **`bind_policy`**. */
  validateBindPayload?: NbcBindPolicyValidateFn | undefined;
};

/** Per-chain mutable state inside {@link MultiplexSessionRuntime}. */
export type ChainState = {
  init: SessionInitNormalized;
  dag: FrameDag;
  sessionOps: SessionOp[];
  confirmedSeq: number;
  pendingAck: boolean;
  active: boolean;
  hooks?: MultiplexChainHooks;
};
