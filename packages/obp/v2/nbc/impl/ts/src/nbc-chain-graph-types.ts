/**
 * View-model graph for NBC chain visualization — derived from {@link ObpPersistenceClient} reads.
 */

import type { JsonDocument, Offer, Port } from "@khoralabs/obp-v2-model";
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

/** Offer row: thin graph shape plus issuer linkage for UI labels. */
export type NbcChainOfferRow = Pick<Offer, "id" | "type" | "expires_seq" | "sourcemaps"> & {
  readonly partyId: string;
  readonly partyName?: string;
  readonly expired?: boolean;
};

/** Port row: thin **`cfd.obp#Port`** plus layout joins and optional NBC overlay for panels. */
export type NbcChainPortRow = Pick<
  Port,
  "id" | "type" | "promise" | "ref" | "sourcemaps" | "expires_seq"
> & {
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
