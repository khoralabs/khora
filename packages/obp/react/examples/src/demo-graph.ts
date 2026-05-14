import type { NbcChainGraph } from "@khoralabs/obp-react";

/** Small NBC chain with genesis → expose → bind → successor expose — matches layout tests. */
export function demoNbcChainGraph(): NbcChainGraph {
  return {
    parties: [
      { id: "buyer", name: "Buyer" },
      { id: "seller", name: "Seller" },
    ],
    offers: [
      {
        id: "offer-genesis",
        type: "opening",
        partyId: "buyer",
        partyName: "Buyer",
        expires_seq: 0n,
        sourcemaps: [],
      },
      {
        id: "offer-bind",
        type: "counter",
        partyId: "seller",
        partyName: "Seller",
        expires_seq: 0n,
        sourcemaps: [],
      },
    ],
    ports: [
      {
        id: "port-a",
        type: "afford-a",
        promise: "Affordance A.",
        ref: "",
        sourcemaps: [],
        expires_seq: 0n,
        exposedOnOfferIds: ["offer-genesis"],
        bindCount: 1,
      },
      {
        id: "port-b",
        type: "afford-b",
        promise: "Affordance B.",
        ref: "",
        sourcemaps: [],
        expires_seq: 0n,
        exposedOnOfferIds: ["offer-genesis"],
        bindCount: 0,
      },
      {
        id: "port-next",
        type: "next",
        promise: "Next-step affordance.",
        ref: "",
        sourcemaps: [],
        expires_seq: 0n,
        exposedOnOfferIds: ["offer-bind"],
        bindCount: 0,
      },
    ],
    extends: [
      { partyId: "buyer", offerId: "offer-genesis" },
      { partyId: "seller", offerId: "offer-bind" },
    ],
    exposes: [
      { offerId: "offer-genesis", portId: "port-a" },
      { offerId: "offer-genesis", portId: "port-b" },
      { offerId: "offer-bind", portId: "port-next" },
    ],
    binds: [
      {
        offerId: "offer-bind",
        portId: "port-a",
        content_receipts: [],
        bind_payload: null,
        bind_policy_snapshot: null,
      },
    ],
  };
}
