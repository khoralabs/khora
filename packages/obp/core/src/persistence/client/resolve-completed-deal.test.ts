import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createObpSqlitePersistence, OBP_SCHEMA_SQL } from "@cfd/obp-sqlite";
import { OBPPersistenceClient } from "./obp-persistence-client.ts";
import { resolveCompletedDeal } from "./resolve-completed-deal.ts";

test("resolveCompletedDeal finds terminal bind on provider offer", () => {
  const db = new Database(":memory:");
  db.run(OBP_SCHEMA_SQL);
  const persistence = createObpSqlitePersistence(db, { ledgerSeq: () => 0 });
  const client = new OBPPersistenceClient(persistence, { ledgerSeq: () => 0 });
  const { party: provider } = client.registerParty({ name: "p", sourcemaps: [] });

  const { offer } = client.extendOffer({
    partyId: provider.id,
    bindPortId: "",
    offer: {
      id: "",
      created_seq: 0,
      expires_seq: 9_000_000,
      type: "t",
      sourcemaps: [],
    },
  });
  const { port } = client.exposePort({
    offerId: offer.id,
    port: {
      id: "",
      created_seq: 0,
      expires_seq: 9_000_000,
      type: "terminal",
      promise: "Terminal completion port.",
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
