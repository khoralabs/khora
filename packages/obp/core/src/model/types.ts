/**
 * Persisted graph shapes aligned with **`cfd.obp`** in `@cfd/obp-spec`
 * ([`shapes.smithy`](../../spec/model/shapes.smithy)).
 *
 * - **`Port.bind_policy`** / **`BindsEdge.bind_policy_snapshot`**: Smithy models these as **`Document`** (`null` when absent); TS uses structured **`PortBindPolicy`** validated via Zod (`@cfd/obp-core`).
 * - **Get results**: Smithy unions **`notFound` / payload** correspond to TS **`{ kind: "notFound" } | { kind: "found"; … }`** (see parity matrix in `@cfd/obp-core` README).
 */

import type { PortBindPolicy } from "../bind-policy/types.ts";

/** Negotiation TTL basis; wire field **`Port.ttl_basis`** (empty string when unset). */
export type NegotiationPortTtlBasis = "turns" | "seconds" | "minutes" | "hours" | "days";

/** Store-agnostic source-map link (`SourceMapRef` in Smithy). */
export type SourceMapRef = {
  resource_id: string;
  source_key: string;
};

export type Party = {
  id: string;
  ts_created: number;
  name: string;
  sourcemaps: SourceMapRef[];
};

export type Offer = {
  id: string;
  ts_created: number;
  ts_expired: number;
  type: string;
  sourcemaps: SourceMapRef[];
};

export type Port = {
  id: string;
  ts_created: number;
  ts_expired: number;
  type: string;
  /** Counterparty-facing copy; **`ObpClient.exposePort`** requires non-empty trimmed text. */
  description: string;
  max_bindings: number;
  terminal: boolean;
  /** Empty string means this port is canonical for ref resolution (no alias). */
  ref: string;
  sourcemaps: SourceMapRef[];
  /** Effective TTL basis when the negotiating host recorded policy at expose time. */
  ttl_basis?: NegotiationPortTtlBasis;
  /** Interpretation depends on `ttl_basis` (e.g. turn count for `"turns"`). */
  ttl_measure?: number;
  /** Completed negotiation turn index when this port was exposed (`audit.turnIndex`). */
  expose_turn_index?: number;
  /** Constraint metadata; counterpart must supply **`counterparty_bind`** on **BINDS** that satisfies this when present. */
  bind_policy?: PortBindPolicy;
};

export type ExtendsEdge = {
  id: string;
  ts_created: number;
  sourcemaps: SourceMapRef[];
};

export type ExposesEdge = {
  id: string;
  ts_created: number;
  sourcemaps: SourceMapRef[];
};

/** **`BindsEdge`** in Smithy; satisfaction payload lives on the edge (`counterparty_bind`, `bind_policy_snapshot`). */
export type BindsEdge = {
  id: string;
  ts_created: number;
  sourcemaps: SourceMapRef[];
  counterparty_bind?: Record<string, unknown>;
  /** Audit copy of **`Port.bind_policy`** at bind time (`BindListingRow.bind_policy_snapshot` / SQLite `bind_policy_json`). */
  bind_policy_snapshot?: PortBindPolicy;
};

/** Row shape for **`ListBinds`** / **`ObpPersistence.listBinds`** (Smithy **`BindListingRow`**). */
export type BindListingRow = {
  offerId: string;
  portId: string;
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
};

export type ExposePortInput = {
  offerId: string;
  port: Port;
};

export type BindPortInput = {
  offerId: string;
  portId: string;
  counterparty_bind?: Record<string, unknown>;
};

export type GetPartyResult = { kind: "notFound" } | { kind: "found"; party: Party };

export type GetOfferResult = { kind: "notFound" } | { kind: "found"; offer: Offer };

export type GetPortResult = { kind: "notFound" } | { kind: "found"; port: Port };
