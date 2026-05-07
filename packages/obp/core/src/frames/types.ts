/**
 * TS shapes aligned with **`cfd.obp.frame`** in `@cfd/obp-spec`
 * ([`frame-protocol.smithy`](../../../spec/model/frame-protocol.smithy)).
 */

import type { PortBindPolicy } from "../bind-policy/types.ts";
import type { ContentAddressedSourceRef, SourceMapRef } from "../model/types.ts";

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
};

/** Symmetric frame body: extend + optional exposes + optional bind (mirrors negotiation runtime turn output). */
export type TurnBody = {
  offerId: string;
  offerType: string;
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

export type SessionInit = {
  session_id: string;
  /** Graph party rows (UUIDs) aligned with {@link actor_pubkeys}. */
  party_ids: [string, string];
  /** Public keys (lowercase hex) aligned with {@link party_ids} — `[responder, initiator]` for the reference HTTP/2 server/client. */
  actor_pubkeys: [string, string];
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

export type WireInitEnvelope = {
  init: SessionInit;
};

/** Handle passed to session handlers (terminate only; TURN replies are the return value of {@link FrameSessionHandlers.onIncomingOffer}). */
export type FrameSessionHandle = {
  readonly sessionId: string;
  readonly init: SessionInit;
  readonly remoteActor: string;
  get tipHash(): string;
  terminate(reason: string, code?: string): Promise<void>;
};

export type FrameSessionHandlers = {
  onIncomingOffer?: (
    body: TurnBody,
    session: FrameSessionHandle,
  ) => Promise<TurnBody | null>;
  /**
   * Inbound peer TERMINATE. The third argument identifies the chain (`SessionInit.session_id`) in multiplex mode;
   * in single-chain sessions it equals that session's id.
   */
  onTerminate?: (reason: string, code?: string, sessionId?: string) => Promise<void>;
};
