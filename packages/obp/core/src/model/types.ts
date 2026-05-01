/** Aligned with `cfd.obp` in `@cfd/obp-spec` / `shapes.smithy`. */

import type { PortBindPolicy } from "../bind-policy/types.ts";

/** Host negotiation TTL metadata persisted on ports (optional extension beyond Smithy). */
export type NegotiationPortTtlBasis = "turns" | "seconds" | "minutes" | "hours" | "days";

/** Store-agnostic source-map link; aligned with `SourceMapRef` in `obp-spec` / `shapes.smithy`. */
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
  /** Required at expose time: human explanation of this affordance for counterparties (host extension). */
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
  /** Optional meta-schema: counterparty must supply matching data at bind time (host extension). */
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

export type BindsEdge = {
  id: string;
  ts_created: number;
  sourcemaps: SourceMapRef[];
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
  /** When binding, answers validated against target port `bind_policy` when set. */
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
