/**
 * Input / output shapes and result unions for `ObpPersistence` — see
 * `packages/obp/v2/persistence/spec/model/persistence.smithy`.
 */

import type { JsonDocument, Offer, Party, Port } from "@khoralabs/obp-v2-model";

// ---------------------------------------------------------------------------
// Result unions (Smithy `union GetXResult`)
// ---------------------------------------------------------------------------

export type GetPartyResult =
  | { readonly kind: "notFound" }
  | { readonly kind: "party"; party: Party };
export type GetOfferResult =
  | { readonly kind: "notFound" }
  | { readonly kind: "offer"; offer: Offer };
export type GetPortResult = { readonly kind: "notFound" } | { readonly kind: "port"; port: Port };

// ---------------------------------------------------------------------------
// RegisterParty
// ---------------------------------------------------------------------------

export type RegisterPartyInput = {
  name: string;
};

export type RegisterPartyOutput = {
  party: Party;
};

// ---------------------------------------------------------------------------
// GetParty / GetOffer / GetPort
// ---------------------------------------------------------------------------

export type GetPartyInput = { id: string };
export type GetPartyOutput = { result: GetPartyResult };

export type GetOfferInput = { id: string };
export type GetOfferOutput = { result: GetOfferResult };

export type GetPortInput = { id: string };
export type GetPortOutput = { result: GetPortResult };

export type GetPortBindPolicyResult =
  | { readonly kind: "notFound" }
  | { readonly kind: "found"; bind_policy: JsonDocument };

export type GetPortBindPolicyInput = { portId: string };
export type GetPortBindPolicyOutput = { result: GetPortBindPolicyResult };

// ---------------------------------------------------------------------------
// ExtendOffer
// ---------------------------------------------------------------------------

export type ExtendOfferInput = {
  partyId: string;
  offer: Offer;
  /** NBC N1 bind-window projection for this offer row — not on thin `Offer`. Default `0` when omitted. */
  nbc_expires_turn?: number;
  nbc_expires_at_relay_ms?: number;
  /** When empty string, no BINDS edge is created. */
  bindPortId: string;
  /** Policy-shaped; NBC validates (`NbcBindSatisfaction`). `null` when not provided. */
  bind_payload: JsonDocument;
};

export type ExtendOfferOutput = {
  offer: Offer;
};

// ---------------------------------------------------------------------------
// ExposePort
// ---------------------------------------------------------------------------

export type ExposePortInput = {
  offerId: string;
  port: Port;
  /** NBC N1 bind-window projection — not on thin `Port`. Default `0` when omitted. */
  nbc_expires_turn?: number;
  nbc_expires_at_relay_ms?: number;
  /** NBC expose-time bind policy persisted on port row; `null` when inactive. */
  bind_policy?: JsonDocument;
};

export type ExposePortOutput = {
  port: Port;
};

// ---------------------------------------------------------------------------
// BindPort
// ---------------------------------------------------------------------------

export type BindPortInput = {
  offerId: string;
  portId: string;
  /** Policy-shaped; NBC validates. `null` when not provided. */
  bind_payload: JsonDocument;
};

/** Empty output shape — success is signalled by resolution (no error thrown). */
export type BindPortOutput = Record<string, never>;

// ---------------------------------------------------------------------------
// ListExposedPortEdges
// ---------------------------------------------------------------------------

export type ListExposedPortEdgesInput = Record<string, never>;

export type ExposedPortEdge = {
  offerId: string;
  portId: string;
};

export type ExposedPortEdgeList = readonly ExposedPortEdge[];

export type ListExposedPortEdgesOutput = {
  edges: ExposedPortEdgeList;
};

// ---------------------------------------------------------------------------
// IsPortExposed
// ---------------------------------------------------------------------------

export type IsPortExposedInput = { portId: string };
export type IsPortExposedOutput = { exposed: boolean };

// ---------------------------------------------------------------------------
// ListBinds
// ---------------------------------------------------------------------------

export type ListBindsInput = Record<string, never>;

export type BindListingRow = {
  offerId: string;
  portId: string;
  /** Persistence projection field; not on `khora.obp#BindsEdge`. */
  bind_payload: JsonDocument;
};

export type BindListingRowList = readonly BindListingRow[];

export type ListBindsOutput = {
  binds: BindListingRowList;
};

// ---------------------------------------------------------------------------
// GetPortsSnapshot
// ---------------------------------------------------------------------------

export type GetPortsSnapshotInput = Record<string, never>;

export type PortSnapshotEntry = {
  portId: string;
  port: Port;
};

export type PortSnapshotEntryList = readonly PortSnapshotEntry[];

export type GetPortsSnapshotOutput = {
  entries: PortSnapshotEntryList;
};

// ---------------------------------------------------------------------------
// GetExtendingPartyId
// ---------------------------------------------------------------------------

export type GetExtendingPartyIdInput = { offerId: string };

export type GetExtendingPartyIdOutput = {
  /** Empty string when no EXTENDS edge exists (Smithy `@default("")`). */
  partyId: string;
};

// ---------------------------------------------------------------------------
// GetNbcBindWindowForOffer / GetNbcBindWindowForPort
// ---------------------------------------------------------------------------

/** NBC N1 bind-window projection for an offer/port row — not on thin `Offer`/`Port`. */
export type ObpNbcBindWindow = {
  nbc_expires_turn: number;
  nbc_expires_at_relay_ms: number;
};

export type GetNbcBindWindowResult =
  | { readonly kind: "notFound" }
  | { readonly kind: "window"; window: ObpNbcBindWindow };

export type GetNbcBindWindowForOfferInput = { offerId: string };
export type GetNbcBindWindowForOfferOutput = { result: GetNbcBindWindowResult };

export type GetNbcBindWindowForPortInput = { portId: string };
export type GetNbcBindWindowForPortOutput = { result: GetNbcBindWindowResult };

// ---------------------------------------------------------------------------
// SetPortExpiredNow / SetOfferExpiredNow
// ---------------------------------------------------------------------------

export type SetPortExpiredNowInput = { portId: string };
export type SetPortExpiredNowOutput = Record<string, never>;

export type SetOfferExpiredNowInput = { offerId: string };
export type SetOfferExpiredNowOutput = Record<string, never>;
