import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { ObpClient } from "@cfd/obp-core";
import { createObpSqlitePersistence, OBP_SCHEMA_SQL } from "@cfd/obp-sqlite";
import { resolveCompletedDeal } from "./matchmaking-obp/index.ts";
import { assertMatchmakingBindAllowed, resolveMatchmakingConnectedDeal } from "./llm/session.ts";

test("resolveCompletedDeal finds terminal bind on requestee offer", () => {
  const db = new Database(":memory:");
  db.run(OBP_SCHEMA_SQL);
  const persistence = createObpSqlitePersistence(db, { now: () => 0 });
  const client = new ObpClient(persistence, { now: () => 0 });
  const { party: requestee } = client.registerParty({ name: "requestee", sourcemaps: [] });

  const { offer } = client.extendOffer({
    partyId: requestee.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: 0,
      ts_expired: 86_400_000,
      type: "counter",
      sourcemaps: [],
    },
  });
  const { port } = client.exposePort({
    offerId: offer.id,
    port: {
      id: "",
      ts_created: 0,
      ts_expired: 86_400_000,
      type: "accept.counter",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  client.bindPort({ offerId: offer.id, portId: port.id });

  const deal = resolveCompletedDeal(client, persistence, requestee.id);
  expect(deal).not.toBeNull();
  if (deal !== null) {
    expect(deal.offerId).toBe(offer.id);
    expect(deal.portId).toBe(port.id);
  }
});

test("resolveMatchmakingConnectedDeal checks both parties' offers", () => {
  const db = new Database(":memory:");
  db.run(OBP_SCHEMA_SQL);
  const persistence = createObpSqlitePersistence(db, { now: () => 0 });
  const client = new ObpClient(persistence, { now: () => 0 });
  const { party: requester } = client.registerParty({ name: "requester", sourcemaps: [] });
  const { party: requestee } = client.registerParty({ name: "requestee", sourcemaps: [] });

  const { offer } = client.extendOffer({
    partyId: requestee.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: 0,
      ts_expired: 86_400_000,
      type: "meeting",
      sourcemaps: [],
    },
  });
  const { port } = client.exposePort({
    offerId: offer.id,
    port: {
      id: "",
      ts_created: 0,
      ts_expired: 86_400_000,
      type: "accept",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  client.bindPort({ offerId: offer.id, portId: port.id });

  const connected = resolveMatchmakingConnectedDeal(
    client,
    persistence,
    requester.id,
    requestee.id,
  );
  expect(connected).not.toBeNull();
  if (connected !== null) {
    expect(connected.offerId).toBe(offer.id);
  }
});

test("assertMatchmakingBindAllowed rejects binding own offer", () => {
  expect(() =>
    assertMatchmakingBindAllowed({ actingPartyId: "p1", offerOwnerPartyId: "p1" }),
  ).toThrow(/may not bind to your own offer/);
});

test("assertMatchmakingBindAllowed allows binding counterparty offer", () => {
  expect(() =>
    assertMatchmakingBindAllowed({ actingPartyId: "p1", offerOwnerPartyId: "p2" }),
  ).not.toThrow();
});
