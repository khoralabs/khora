import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { initObpV2Schema } from "./connection.ts";
import { createObpV2SqlitePersistenceClient } from "./index.ts";

function makeClient() {
  const db = new Database(":memory:");
  initObpV2Schema(db);
  let seq = 0;
  return createObpV2SqlitePersistenceClient(db, { ledgerSeq: () => ++seq });
}

describe("SqliteObpPersistenceStrategy", () => {
  test("registerParty + getParty roundtrip", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Alice", sourcemaps: [] });
    expect(party.name).toBe("Alice");
    expect((await client.getParty({ id: party.id })).result.kind).toBe("party");
    expect((await client.getParty({ id: "missing" })).result.kind).toBe("notFound");
  });

  test("extendOffer + bindPort + listBinds", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Bob", sourcemaps: [] });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", expires_seq: 9999n, type: "step", sourcemaps: [] },
      bindPortId: "",
      bind_payload: null,
    });
    const { port } = await client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        expires_seq: 9999n,
        type: "slot",
        promise: "p",
        ref: "",
        sourcemaps: [],
      },
    });
    await client.bindPort({ offerId: offer.id, portId: port.id, bind_payload: { x: 1 } });
    const { binds } = await client.listBinds();
    const row = binds.find((b) => b.portId === port.id);
    expect(row?.bind_payload).toEqual({ x: 1 });
  });

  test("setOfferExpiredNow cascades to exposed ports", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Carol", sourcemaps: [] });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", expires_seq: 9999n, type: "step", sourcemaps: [] },
      bindPortId: "",
      bind_payload: null,
    });
    const { port } = await client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        expires_seq: 9999n,
        type: "slot",
        promise: "",
        ref: "",
        sourcemaps: [],
      },
    });
    await client.setOfferExpiredNow(offer.id);
    const po = await client.getPort({ id: port.id });
    expect(po.result.kind).toBe("port");
    if (po.result.kind === "port") {
      expect(po.result.port.expires_seq).toBe(0n);
    }
  });
});
