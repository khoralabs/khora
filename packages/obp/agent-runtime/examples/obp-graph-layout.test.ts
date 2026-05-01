import { expect, test } from "bun:test";
import type { GraphSnapshot } from "./graph-snapshot.ts";
import { graphSnapshotToFlow } from "./obp-graph-layout.ts";

test("flowchart layout places successor offer to the right of bound port", () => {
  const g: GraphSnapshot = {
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
        tsExpired: 0,
        expired: false,
      },
      {
        id: "offer-bind",
        type: "counter",
        partyId: "seller",
        partyName: "Seller",
        tsExpired: 0,
        expired: false,
      },
    ],
    ports: [
      {
        id: "port-a",
        type: "afford-a",
        terminal: false,
        maxBindings: 1,
        ref: "",
        bindCount: 1,
        tsExpired: 0,
        expired: false,
        exposedOnOfferIds: ["offer-genesis"],
      },
      {
        id: "port-b",
        type: "afford-b",
        terminal: false,
        maxBindings: 1,
        ref: "",
        bindCount: 0,
        tsExpired: 0,
        expired: false,
        exposedOnOfferIds: ["offer-genesis"],
      },
      {
        id: "port-next",
        type: "next",
        terminal: false,
        maxBindings: 1,
        ref: "",
        bindCount: 0,
        tsExpired: 0,
        expired: false,
        exposedOnOfferIds: ["offer-bind"],
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
    binds: [{ offerId: "offer-bind", portId: "port-a" }],
  };

  const { nodes } = graphSnapshotToFlow(g);
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
  const g: GraphSnapshot = {
    parties: [{ id: "p1", name: "Party" }],
    offers: [
      {
        id: "o1",
        type: "seed",
        partyId: "p1",
        partyName: "Party",
        tsExpired: 0,
        expired: false,
      },
    ],
    ports: [
      {
        id: "pt1",
        type: "listing",
        terminal: false,
        maxBindings: 1,
        ref: "",
        bindCount: 0,
        tsExpired: 0,
        expired: false,
        exposedOnOfferIds: ["o1"],
      },
    ],
    extends: [{ partyId: "p1", offerId: "o1" }],
    exposes: [{ offerId: "o1", portId: "pt1" }],
    binds: [],
  };

  const { nodes } = graphSnapshotToFlow(g);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  expect([...byId.keys()].some((id) => id.startsWith("party:"))).toBe(false);

  const offerNode = byId.get("offer:o1");
  expect((offerNode?.data as { partyLabel?: string }).partyLabel).toBe("Party");

  const xOffer = offerNode?.position.x ?? 0;
  const xPort = byId.get("port:pt1")?.position.x ?? 0;

  expect(xOffer).toBeGreaterThanOrEqual(0);
  expect(xPort).toBeGreaterThan(xOffer);
});
