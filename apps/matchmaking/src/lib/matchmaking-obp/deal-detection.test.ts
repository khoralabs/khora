import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { ObpClient } from "@cfd/obp-core";
import { createObpSqlitePersistence, OBP_SCHEMA_SQL } from "@cfd/obp-sqlite";
import { resolveCompletedDeal } from "./deal-detection.ts";

test("resolveCompletedDeal finds terminal bind on provider offer", () => {
  const db = new Database(":memory:");
  db.run(OBP_SCHEMA_SQL);
  const persistence = createObpSqlitePersistence(db, { now: () => 0 });
  const client = new ObpClient(persistence, { now: () => 0 });
  const { party: provider } = client.registerParty({ name: "p", sourcemaps: [] });

  const { offer } = client.extendOffer({
    partyId: provider.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: 0,
      ts_expired: 86_400_000,
      type: "t",
      sourcemaps: [],
    },
  });
  const { port } = client.exposePort({
    offerId: offer.id,
    port: {
      id: "",
      ts_created: 0,
      ts_expired: 86_400_000,
      type: "terminal",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  client.bindPort({ offerId: offer.id, portId: port.id });

  const deal = resolveCompletedDeal(client, persistence, provider.id);
  expect(deal).not.toBeNull();
  if (deal !== null) {
    expect(deal.offerId).toBe(offer.id);
    expect(deal.portId).toBe(port.id);
    expect(deal.portType).toBe("terminal");
  }
});
