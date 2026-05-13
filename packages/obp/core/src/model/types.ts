/**
 * Persisted graph shapes aligned with **`cfd.obp`** in `@khoralabs/obp-spec`
 * ([`shapes.smithy`](../../../persistence/spec/model/shapes.smithy)).
 *
 * - **`Port.bind_policy`** / **`BindsEdge.bind_policy_snapshot`**: Smithy models these as **`Document`** (`null` when absent); TS uses structured **`PortBindPolicy`** validated via Zod (`@khoralabs/obp-core`).
 * - **Get results**: Smithy unions **`notFound` / payload** correspond to TS **`{ kind: "notFound" } | { kind: "found"; … }`** (see parity matrix in `@khoralabs/obp-core` README).
 */

import type { PortBindPolicy } from "../bind-policy/types.ts";

/** Negotiation TTL basis; wire field **`Port.ttl_basis`** (empty / unset when no TTL metadata). */
export type NegotiationPortTtlBasis = "turns" | "ledger_seq";

/** Store-agnostic source-map link (`SourceMapRef` in Smithy). */
export type SourceMapRef = {
  resource_id: string;
  source_key: string;
};

/** Content-addressable receipt (`ContentAddressedSourceRef` in Smithy). */
export type ContentAddressedSourceRef = {
  resource_id: string;
  source_key: string;
  /** Lowercase hex SHA-256 of body bytes per embedding conventions. */
  content_sha256_hex: string;
};

export type Party = {
  id: string;
  /** Ledger sequence when this party was committed (Smithy **`created_seq`**). */
  created_seq: number;
  name: string;
  sourcemaps: SourceMapRef[];
};

export type Offer = {
  id: string;
  /** Ledger sequence when this offer was committed. */
  created_seq: number;
  /** Exclusive upper bound: bind invalid when **`ledger_seq >= expires_seq`**. */
  expires_seq: number;
  type: string;
  sourcemaps: SourceMapRef[];
};

export type Port = {
  id: string;
  /** Ledger sequence when this port was committed. */
  created_seq: number;
  /** Exclusive upper bound: bind invalid when **`ledger_seq >= expires_seq`**. */
  expires_seq: number;
  type: string;
  /** Counterparty-facing affordance copy; **`OBPPersistenceClient.exposePort`** (see `@khoralabs/obp-persistence-client`) requires non-empty trimmed text. */
  promise: string;
  max_bindings: number;
  terminal: boolean;
  /** Empty string means this port is canonical for ref resolution (no alias). */
  ref: string;
  sourcemaps: SourceMapRef[];
  /** Effective TTL basis when the negotiating host recorded policy at expose time. */
  ttl_basis?: NegotiationPortTtlBasis;
  /** Interpretation depends on `ttl_basis` (turns or ledger ticks). */
  ttl_measure?: number;
  /** Ledger seq / aligned turn index when this port was exposed. */
  expose_seq?: number;
  /** When set, **`counterparty_bind`** on **BINDS** must satisfy this policy at bind time or the bind is rejected. */
  bind_policy?: PortBindPolicy;
};

export type ExtendsEdge = {
  id: string;
  created_seq: number;
  sourcemaps: SourceMapRef[];
};

export type ExposesEdge = {
  id: string;
  created_seq: number;
  sourcemaps: SourceMapRef[];
};

/** **`BindsEdge`** in Smithy; satisfaction payload lives on the edge (`counterparty_bind`, `bind_policy_snapshot`). */
export type BindsEdge = {
  id: string;
  created_seq: number;
  sourcemaps: SourceMapRef[];
  content_receipts: ContentAddressedSourceRef[];
  counterparty_bind?: Record<string, unknown>;
  /** Audit copy of **`Port.bind_policy`** at bind time (`BindListingRow.bind_policy_snapshot` / SQLite `bind_policy_json`). */
  bind_policy_snapshot?: PortBindPolicy;
};

/** Row shape for **`ListBinds`** / **`ObpPersistence.listBinds`** (Smithy **`BindListingRow`**). */
export type BindListingRow = {
  offerId: string;
  portId: string;
  content_receipts?: ContentAddressedSourceRef[];
  counterparty_bind?: Record<string, unknown>;
  bind_policy_snapshot?: PortBindPolicy;
};

/** `RegisterParty` input (Smithy). */
export type RegisterPartyInput = {
  name: string;
  sourcemaps: SourceMapRef[];
};

/** `ExtendOffer` input (Smithy). Empty `bindPortId` means no BINDS edge. */
export type ExtendOfferInput = {
  partyId: string;
  offer: Offer;
  bindPortId: string;
  /** Satisfaction payload for **`BindsEdge.counterparty_bind`** when binding. */
  counterparty_bind?: Record<string, unknown>;
  /** Optional **`BindsEdge.content_receipts`** when creating a bind during extend. */
  content_receipts?: ContentAddressedSourceRef[];
};

export type ExposePortInput = {
  offerId: string;
  port: Port;
};

export type BindPortInput = {
  offerId: string;
  portId: string;
  counterparty_bind?: Record<string, unknown>;
  content_receipts?: ContentAddressedSourceRef[];
};

export type GetPartyResult = { kind: "notFound" } | { kind: "found"; party: Party };

export type GetOfferResult = { kind: "notFound" } | { kind: "found"; offer: Offer };

export type GetPortResult = { kind: "notFound" } | { kind: "found"; port: Port };
