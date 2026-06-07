/**
 * TypeScript models for **`khora.obp`** graph vocabulary — see
 * `packages/obp/v2/model/spec/model/shapes.smithy`.
 */

/** Smithy `Document` — JSON-compatible value (`khora.obp` persistence surface). */
export type JsonDocument =
  | null
  | boolean
  | number
  | string
  | readonly JsonDocument[]
  | { readonly [key: string]: JsonDocument };

/** Issuing actor. Implementations SHOULD use UUID v7 ids. */
export type Party = {
  id: string;
  name: string;
};

/**
 * Proposal or workflow step — identity and `type` only.
 * NBC bind windows live on TURN wire (`NbcOfferSpec`) and `ObpPersistence` `nbc_expires_*` projection.
 */
export type Offer = {
  id: string;
  type: string;
};

/**
 * Affordance / continuation point.
 * `promise` defaults to `""` (empty when not specified on wire).
 * `ref` defaults to `""` (non-empty aliases another port; implementations MUST detect cycles).
 * NBC bind windows: `NbcPortSpec` + persistence projection, not on this shape.
 */
export type Port = {
  id: string;
  type: string;
  promise: string;
  ref: string;
};

/** Party -[EXTENDS]-> Offer. */
export type ExtendsEdge = {
  id: string;
};

/** Offer -[EXPOSES]-> Port. */
export type ExposesEdge = {
  id: string;
};

/**
 * Offer -[BINDS]-> Port — graph identity only.
 * `bind_payload` lives on the persistence listing row, not here.
 */
export type BindsEdge = {
  id: string;
};

/** Service version for `ObpPersistence` in Smithy. */
export const OBP_PERSISTENCE_VERSION = "2026-05-01" as const;
