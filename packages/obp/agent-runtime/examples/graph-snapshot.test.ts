import { expect, test } from "bun:test";
import { ObpClient } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { expiresAtFromHours } from "@cfd/obp-tools";
import { buildGraphSnapshot } from "./graph-snapshot.ts";

test("buildGraphSnapshot returns parties offers ports and edges", () => {
  const now = () => 1_700_000_000_000;
  const persistence = new FakeObpPersistence(now);
  const client = new ObpClient(persistence, { now });
  const { party: buyer } = persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  expect(buyer.id).toBeDefined();
  expect(seller.id).toBeDefined();
  const { offer } = client.extendOffer({
    partyId: seller.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: now(),
      ts_expired: expiresAtFromHours(now(), 24),
      type: "seed",
      sourcemaps: [],
    },
  });
  client.exposePort({
    offerId: offer.id,
    port: {
      id: "",
      ts_created: now(),
      ts_expired: expiresAtFromHours(now(), 24),
      type: "listing",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });

  const snap = buildGraphSnapshot(persistence, client, now(), 0);
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
  const now = () => 1_700_000_000_000;
  const persistence = new FakeObpPersistence(now);
  const client = new ObpClient(persistence, { now });
  persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const { offer } = client.extendOffer({
    partyId: seller.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: now(),
      ts_expired: expiresAtFromHours(now(), 24),
      type: "seed",
      sourcemaps: [],
    },
  });
  client.exposePort({
    offerId: offer.id,
    port: {
      id: "",
      ts_created: now(),
      ts_expired: expiresAtFromHours(now(), 24),
      type: "listing",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
      ttl_basis: "turns",
      ttl_measure: 1,
      expose_turn_index: 0,
    },
  });

  expect(buildGraphSnapshot(persistence, client, now(), 1).ports[0]?.expired).toBe(false);
  expect(buildGraphSnapshot(persistence, client, now(), 2).ports[0]?.expired).toBe(true);
});
