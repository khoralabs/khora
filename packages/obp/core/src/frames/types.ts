/**
 * TS shapes aligned with **`cfd.obp.frame`** in `@cfd/obp-spec`
 * ([`frame-protocol.smithy`](../../../spec/model/frame-protocol.smithy)).
 */

import type { PortBindPolicy } from "../bind-policy/types.ts";
import type {
  ContentAddressedSourceRef,
  NegotiationPortTtlBasis,
  SourceMapRef,
} from "../model/types.ts";

export type FrameType = "TURN" | "TERMINATE";

export type ContentReceipt = ContentAddressedSourceRef;

export type PortSpec = {
  id: string;
  isTerminal: boolean;
  /** Canonical bind capacity; default **1** when omitted on wire (matches `cfd.obp.frame#PortSpec.max_bindings`). */
  max_bindings?: number;
  /** Parsed when non-null; unconstrained ports omit or use null. */
  bind_policy?: PortBindPolicy | null;
  ttl?: unknown;
  /** Negotiation / rich exposes: persisted **`Port.type`** (frame demos omit → **`obp.frame.port`**). */
  portType?: string;
  /** Negotiation: persisted **`Port.promise`** (frame demos default to **`id`** when omitted). */
  promise?: string;
  ref?: string;
  expose_seq?: number;
  ttl_basis?: NegotiationPortTtlBasis;
  ttl_measure?: number;
  /** Resolved ledger **`expires_seq`** for this port when supplied by the materializer. */
  expires_seq?: number;
  sourcemaps?: SourceMapRef[];
};

/** Symmetric frame body: extend + optional exposes + optional bind (mirrors negotiation runtime turn output). */
export type TurnBody = {
  offerId: string;
  offerType: string;
  /** Resolved ledger **`expires_seq`** for the new offer when supplied by the materializer. */
  expires_seq?: number;
  /** Optional alternation counter; scoped per chain when multiplexing. */
  turn_seq?: number;
  sourcemaps?: SourceMapRef[];
  ttl?: unknown;
  ports?: PortSpec[];
  /** Counterparty-exposed port to bind; omit or empty for a pure extend/expose turn. */
  bindPortId?: string;
  counterparty_bind?: Record<string, unknown>;
  content_receipts?: ContentReceipt[];
};

export type TerminateBody = {
  reason: string;
  code?: string;
};

export type FrameBody = TurnBody | TerminateBody;

export type Frame = {
  p_hash: string;
  actor: string;
  sig: string;
  type: FrameType;
  /** Body discriminated by `type` */
  body: Record<string, unknown>;
};

/** Bilateral session participant: graph party id and signing actor pubkey. Distinct from the persistence graph **`Party`** type (`registerParty`). */
export type SessionParty = {
  id: string;
  pubkey: string;
};

export type SessionInit = {
  session_id: string;
  /**
   * Exactly two participants. **`parties[0].pubkey`** ≤ **`parties[1].pubkey`** (binary string compare on lowercase hex);
   * wire **`party_ids`** / **`actor_pubkeys`** use the same order (see **`canonicalSessionParties`** / **`normalizeSessionInit`**).
   */
  parties: [SessionParty, SessionParty];
  genesis_hash: string;
};

/** Merkle checkpoint (`cfd.obp.session`) on the wire in {@link SessionEnvelopeWire}. */
export type SessionCheckpoint = {
  seq: number;
  root_hex: string;
};

/**
 * Multiplexed JSON object `session_envelope` on the frame byte stream; aligns with `cfd.obp.session#SessionEnvelope`.
 */
export type SessionEnvelopeWire = {
  session_id: string;
  from_party: string;
  base_checkpoint: SessionCheckpoint;
  delta_ops: unknown[];
  new_checkpoint: SessionCheckpoint;
};

/** Logical `{ "init": … }` message; on the wire, `init` uses paired **`party_ids`** + **`actor_pubkeys`** arrays per **`cfd.obp.frame`** — decoded into {@link SessionInit}. */
export type WireInitEnvelope = {
  init: SessionInit;
};

/** Handle passed to session handlers and {@link FrameSessionHandlers.onSessionReady}. */
export type FrameSessionHandle = {
  readonly sessionId: string;
  readonly init: SessionInit;
  readonly remoteActor: string;
  get tipHash(): string;
  sendTurn(body: TurnBody): Promise<void>;
  terminate(reason: string, code?: string): Promise<void>;
};

/** Per-chain handlers when multiplexing; falls back to {@link FrameSessionHandlers} on the same runner when absent. */
export type MultiplexChainHooks = {
  onIncomingOffer?: (body: TurnBody, session: FrameSessionHandle) => Promise<TurnBody | null>;
  /** Inbound peer TERMINATE for this chain only. */
  onTerminate?: (
    reason: string,
    code: string | undefined,
    session: FrameSessionHandle,
  ) => Promise<void>;
};

export type FrameMultiplexOpenerApi = {
  /** Write `{ init }`, register chain, return handle for outbound turns. */
  init(init: SessionInit, hooks?: MultiplexChainHooks): Promise<FrameSessionHandle>;
  /** No further outbound chains will be opened; channel may close when all chains are torn down (see `closeChannelWhenIdle`). */
  close(): void;
};

export type FrameSessionHandlers = {
  /** Called for both peers after a chain is registered (after inbound `init` or immediately after this side writes `init`). */
  onSessionReady?: (session: FrameSessionHandle) => Promise<void>;
  onIncomingOffer?: (body: TurnBody, session: FrameSessionHandle) => Promise<TurnBody | null>;
  /**
   * Inbound peer TERMINATE. The third argument identifies the chain (`SessionInit.session_id`) in multiplex mode;
   * in single-chain sessions it equals that session's id.
   */
  onTerminate?: (reason: string, code?: string, sessionId?: string) => Promise<void>;
};
