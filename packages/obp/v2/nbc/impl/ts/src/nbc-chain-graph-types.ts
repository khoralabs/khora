/**
 * View-model graph for NBC chain visualization — derived from {@link ObpPersistenceClient} reads.
 */

import type { JsonDocument, SourceMapRefList } from "@khoralabs/obp-v2-model";
import type { BindListingRow } from "@khoralabs/obp-v2-persistence";

export type NbcChainPartyRow = {
  readonly id: string;
  readonly name: string;
};

export type NbcChainExtendEdge = {
  readonly partyId: string;
  readonly offerId: string;
};

export type NbcChainExposeEdge = {
  readonly offerId: string;
  readonly portId: string;
};

/** Offer row: thin graph shape + NBC bind-window fields for UI (from `getNbcBindWindowForOffer`). */
export type NbcChainOfferRow = {
  readonly id: string;
  readonly type: string;
  readonly sourcemaps: SourceMapRefList;
  readonly expires_turn: number;
  readonly expires_at_relay_ms: number;
  readonly partyId: string;
  readonly partyName?: string;
  readonly expired?: boolean;
};

/** Port row: thin `cfd.obp#Port` + NBC expiry projection + layout joins. */
export type NbcChainPortRow = {
  readonly id: string;
  readonly type: string;
  readonly promise: string;
  readonly ref: string;
  readonly sourcemaps: SourceMapRefList;
  readonly expires_turn: number;
  readonly expires_at_relay_ms: number;
  readonly exposedOnOfferIds: readonly string[];
  readonly bindCount: number;
  readonly expired?: boolean;
  readonly terminal?: boolean;
  readonly max_bindings?: number;
  readonly bind_policy?: JsonDocument;
};

export type NbcChainGraph = {
  readonly parties: readonly NbcChainPartyRow[];
  readonly extends: readonly NbcChainExtendEdge[];
  readonly exposes: readonly NbcChainExposeEdge[];
  readonly binds: readonly BindListingRow[];
  readonly offers: readonly NbcChainOfferRow[];
  readonly ports: readonly NbcChainPortRow[];
};
