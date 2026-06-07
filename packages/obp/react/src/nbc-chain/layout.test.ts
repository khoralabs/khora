import { expect, test } from "bun:test";
import type { NbcChainGraph } from "@khoralabs/obp-nbc";
import { nbcChainGraphToFlow } from "./layout";

test("flowchart layout places successor offer to the right of bound port", () => {
  const g: NbcChainGraph = {
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
        expires_turn: 0,
        expires_at_relay_ms: 0,
      },
      {
        id: "offer-bind",
        type: "counter",
        partyId: "seller",
        partyName: "Seller",
        expires_turn: 0,
        expires_at_relay_ms: 0,
      },
    ],
    ports: [
      {
        id: "port-a",
        type: "afford-a",
        promise: "Affordance A.",
        ref: "",
        expires_turn: 0,
        expires_at_relay_ms: 0,
        exposedOnOfferIds: ["offer-genesis"],
        bindCount: 1,
      },
      {
        id: "port-b",
        type: "afford-b",
        promise: "Affordance B.",
        ref: "",
        expires_turn: 0,
        expires_at_relay_ms: 0,
        exposedOnOfferIds: ["offer-genesis"],
        bindCount: 0,
      },
      {
        id: "port-next",
        type: "next",
        promise: "Next-step affordance.",
        ref: "",
        expires_turn: 0,
        expires_at_relay_ms: 0,
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
        bind_payload: null,
      },
    ],
  };

  const { nodes } = nbcChainGraphToFlow(g);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  expect([...byId.keys()].some((id) => id.startsWith("party:"))).toBe(false);

  const genesisNode = byId.get("offer:offer-genesis");
  expect((genesisNode?.data as { partyLabel?: string }).partyLabel).toBe("Buyer");

  const xGenesis = genesisNode?.position.x ?? 0;
  const xBind = byId.get("offer:offer-bind")?.position.x ?? 0;
  const xPortA = byId.get("port:port-a")?.position.x ?? 0;

  expect(xPortA).toBeGreaterThan(xGenesis);
  expect(xBind).toBeGreaterThan(xPortA);
});

test("genesis-only snapshot lays offer then ports to the right", () => {
  const g: NbcChainGraph = {
    parties: [{ id: "p1", name: "Party" }],
    offers: [
      {
        id: "o1",
        type: "seed",
        partyId: "p1",
        partyName: "Party",
        expires_turn: 0,
        expires_at_relay_ms: 0,
      },
    ],
    ports: [
      {
        id: "pt1",
        type: "listing",
        promise: "Layout test listing.",
        ref: "",
        expires_turn: 0,
        expires_at_relay_ms: 0,
        exposedOnOfferIds: ["o1"],
        bindCount: 0,
      },
    ],
    extends: [{ partyId: "p1", offerId: "o1" }],
    exposes: [{ offerId: "o1", portId: "pt1" }],
    binds: [],
  };

  const { nodes } = nbcChainGraphToFlow(g);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  expect([...byId.keys()].some((id) => id.startsWith("party:"))).toBe(false);

  const offerNode = byId.get("offer:o1");
  expect((offerNode?.data as { partyLabel?: string }).partyLabel).toBe("Party");

  const xOffer = offerNode?.position.x ?? 0;
  const xPort = byId.get("port:pt1")?.position.x ?? 0;

  expect(xOffer).toBeGreaterThanOrEqual(0);
  expect(xPort).toBeGreaterThan(xOffer);
});
