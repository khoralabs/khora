/**
 * TS shapes aligned with **`cfd.obp.frame`** in `@cfd/obp-spec`
 * ([`frame-protocol.smithy`](../../../spec/model/frame-protocol.smithy)).
 */

import type { PortBindPolicy } from "../bind-policy/types.ts";
import type { ContentAddressedSourceRef } from "../model/types.ts";

export type FrameType = "PROLIFERATE" | "RESOLVE" | "TERMINATE";

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

export type ProliferateBody = {
  offerId: string;
  ports: PortSpec[];
};

export type ResolveBody = {
  offerId: string;
  portId: string;
  payload?: Record<string, unknown>;
  content_receipts?: ContentReceipt[];
};

export type TerminateBody = {
  reason: string;
  code?: string;
};

export type FrameBody = ProliferateBody | ResolveBody | TerminateBody;

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

/** Handle passed to session handlers (expose / terminate / resolve). */
export type FrameSessionHandle = {
  readonly sessionId: string;
  readonly init: SessionInit;
  readonly remoteActor: string;
  get tipHash(): string;
  expose(input: { offerId: string; ports: PortSpec[] }): Promise<void>;
  terminate(reason: string, code?: string): Promise<void>;
  resolve(plan: { offerId: string; portId: string; payload?: Record<string, unknown> }): Promise<void>;
};

