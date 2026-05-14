/**
 * TypeScript models for **`cfd.obp.frame`** — see
 * `packages/obp/v2/frames/spec/model/frame-protocol.smithy`.
 */

/** Smithy `Document`: JSON-compatible value on the wire. */
export type JsonDocument =
  | null
  | boolean
  | number
  | string
  | readonly JsonDocument[]
  | { readonly [key: string]: JsonDocument };

/** `Sha256HexLower` — lowercase hex, 32-byte digest, length **64**, no `0x`. */
export type Sha256HexLower = string & { readonly __brand?: "Sha256HexLower" };

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isSha256HexLower(s: string): s is Sha256HexLower {
  return SHA256_HEX.test(s);
}

export function toSha256HexLower(s: string): Sha256HexLower {
  if (!SHA256_HEX.test(s)) {
    throw new TypeError("expected 64-char lowercase hex Sha256HexLower");
  }
  return s as Sha256HexLower;
}

/** Smithy `FrameType` enum. */
export const FrameType = {
  TURN: "TURN",
  /** Actor will send no further offer-extending **TURN**s on this chain; still advances the DAG tip (unlike **TERMINATE**). */
  END_OFFERS: "END_OFFERS",
  TERMINATE: "TERMINATE",
} as const;

export type FrameType = (typeof FrameType)[keyof typeof FrameType];

/** `PartyIdList` — wire list; session bootstrap uses exactly **two** ids (see `SessionInit`). */
export type PartyIdList = readonly string[];

/** `ActorPubkeyList` — wire list; paired index-wise with **`party_ids`**. */
export type ActorPubkeyList = readonly string[];

/** `SessionInit` — negotiation partition + bootstrapping hash (Smithy wire shape: parallel arrays). */
export type SessionInit = {
  session_id: string;
  party_ids: PartyIdList;
  actor_pubkeys: ActorPubkeyList;
  genesis_hash: Sha256HexLower;
};

/** Bilateral session participant: graph party id paired with its signing actor pubkey. */
export type SessionParty = {
  id: string;
  pubkey: string;
};

/**
 * Normalized (projected) form of `SessionInit`: parallel `party_ids` / `actor_pubkeys` arrays
 * zipped into typed pairs, canonical pubkey order (`parties[0].pubkey` ≤ `parties[1].pubkey`).
 */
export type SessionInitNormalized = {
  session_id: string;
  parties: [SessionParty, SessionParty];
  genesis_hash: string;
};

/** `{ "init": … }` envelope on the duplex byte stream (multiplex bootstrap). */
export type InitEnvelopeWire = {
  readonly init: SessionInit;
};

/** `Frame` — atomic signed unit on the bilateral negotiation DAG. */
export type Frame = {
  p_hash: Sha256HexLower;
  actor: string;
  sig: string;
  type: FrameType;
  body: JsonDocument;
};

/** Merkle checkpoint inside **`session_envelope`** wire JSON (`seq` is JSON **`number`**). */
export type SessionEnvelopeCheckpointWire = {
  seq: number;
  root_hex: string;
};

/**
 * Multiplexed **`session_envelope`** object on the frame byte stream (`cfd.obp.session` payload).
 */
export type SessionEnvelopeWire = {
  session_id: string;
  from_party: string;
  base_checkpoint: SessionEnvelopeCheckpointWire;
  delta_ops: unknown[];
  new_checkpoint: SessionEnvelopeCheckpointWire;
};

/** Normative on-wire JSON objects in this namespace: **init** envelope or a **Frame**. */
export type FramedWireObject = InitEnvelopeWire | Frame;

/** Service version from `NegotiationFrameProtocol` in Smithy. */
export const NEGOTIATION_FRAME_PROTOCOL_VERSION = "2026-05-15" as const;
