import type { JsonDocument } from "@khoralabs/obp-v2-model";

/**
 * Declarative CLI affordance aligned with **`NbcPortSpec`** (id, optional bind_policy, promise hint).
 */
export type FlowPort = {
  id: string;
  prompt: string;
  optional?: boolean;
  bind_policy?: JsonDocument | null;
  /** Echo of NBC `promise` — UX / documentation; not sent on wire. */
  promise?: string;
};

/**
 * One logical offer / step grouping ports (aligned with **`NbcOfferSpec.id`** as offer identity in a turn).
 */
export type FlowOffer = {
  id: string;
  ports: readonly FlowPort[];
};

export type FlowDefinition = {
  /** Stable id for this wizard / command flow */
  id: string;
  offers: readonly FlowOffer[];
};
