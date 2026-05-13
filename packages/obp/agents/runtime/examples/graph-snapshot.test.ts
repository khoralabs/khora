import { expect, test } from "bun:test";
import { OBPPersistenceClient } from "@khoralabs/obp-persistence-client";
import { FakeObpPersistence } from "@khoralabs/obp-core/testing";
import { buildGraphSnapshot } from "./shared/graph-snapshot.ts";

function far(seq: number): number {
  return seq + 10_000_000;
}

test("buildGraphSnapshot returns parties offers ports and edges", () => {
  const t = { v: 1_700_000_000_000 };
  const ledgerSeq = () => t.v;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const client = new OBPPersistenceClient({ persistence, ledgerSeq });
  const { party: buyer } = persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  expect(buyer.id).toBeDefined();
  expect(seller.id).toBeDefined();
  const seq = ledgerSeq();
  const { offer } = client.extendOffer({
    partyId: seller.id,
    bindPortId: "",
    offer: {
      id: "",
      created_seq: seq,
      expires_seq: far(seq),
      type: "seed",
      sourcemaps: [],
    },
  });
  client.exposePort({
    offerId: offer.id,
    port: {
      id: "",
      created_seq: seq,
      expires_seq: far(seq),
      type: "listing",
      promise: "Listing for snapshot test.",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });

  const snap = buildGraphSnapshot(persistence, client, ledgerSeq(), 0);
  expect(snap.parties.length).toBe(2);
  expect(snap.offers.length).toBe(1);
  expect(snap.ports.length).toBe(1);
  expect(snap.extends.length).toBe(1);
  expect(snap.exposes.length).toBe(1);
  expect(snap.binds.length).toBe(0);
  expect(snap.offers[0]?.partyName).toBe("seller");
  expect(snap.offers[0]?.expired).toBe(false);
  expect(snap.ports[0]?.exposedOnOfferIds).toEqual([offer.id]);
  expect(snap.ports[0]?.bindCount).toBe(0);
});

test("buildGraphSnapshot turn-TTL expired when negotiation turns exceed window", () => {
  const t = { v: 1_700_000_000_000 };
  const ledgerSeq = () => t.v;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const client = new OBPPersistenceClient({ persistence, ledgerSeq });
  persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const seq = ledgerSeq();
  const { offer } = client.extendOffer({
    partyId: seller.id,
    bindPortId: "",
    offer: {
      id: "",
      created_seq: seq,
      expires_seq: far(seq),
      type: "seed",
      sourcemaps: [],
    },
  });
  client.exposePort({
    offerId: offer.id,
    port: {
      id: "",
      created_seq: seq,
      expires_seq: far(seq),
      type: "listing",
      promise: "TTL listing.",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
      ttl_basis: "turns",
      ttl_measure: 1,
      expose_seq: 0,
    },
  });

  expect(buildGraphSnapshot(persistence, client, ledgerSeq(), 1).ports[0]?.expired).toBe(false);
  expect(buildGraphSnapshot(persistence, client, ledgerSeq(), 2).ports[0]?.expired).toBe(true);
});
