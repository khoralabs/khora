/** Aligned with `cfd.obp` in `@cfd/obp-spec` / `shapes.smithy`. */

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
  max_bindings: number;
  terminal: boolean;
  /** Empty string means this port is canonical for ref resolution (no alias). */
  ref: string;
  sourcemaps: SourceMapRef[];
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
};

export type ExposePortInput = {
  offerId: string;
  port: Port;
};

export type BindPortInput = {
  offerId: string;
  portId: string;
};

export type GetPartyResult = { kind: "notFound" } | { kind: "found"; party: Party };

export type GetOfferResult = { kind: "notFound" } | { kind: "found"; offer: Offer };

export type GetPortResult = { kind: "notFound" } | { kind: "found"; port: Port };
