import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { initObpV2Schema } from "./connection.ts";
import { createObpV2SqlitePersistenceClient } from "./index.ts";

function makeClient() {
  const db = new Database(":memory:");
  initObpV2Schema(db);
  return createObpV2SqlitePersistenceClient(db);
}

describe("SqliteObpPersistenceStrategy", () => {
  test("registerParty + getParty roundtrip", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Alice" });
    expect(party.name).toBe("Alice");
    expect((await client.getParty({ id: party.id })).result.kind).toBe("party");
    expect((await client.getParty({ id: "missing" })).result.kind).toBe("notFound");
  });

  test("extendOffer + bindPort + listBinds", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Bob" });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", type: "step" },
      bindPortId: "",
      bind_payload: null,
    });
    const { port } = await client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        type: "slot",
        promise: "p",
        ref: "",
      },
    });
    await client.bindPort({ offerId: offer.id, portId: port.id, bind_payload: { x: 1 } });
    const { binds } = await client.listBinds();
    const row = binds.find((b) => b.portId === port.id);
    expect(row?.bind_payload).toEqual({ x: 1 });
  });

  test("exposePort persists bind_policy and getPortBindPolicy reads it", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Dana" });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", type: "step" },
      bindPortId: "",
      bind_payload: null,
    });
    const policy = {
      type: "object",
      additionalProperties: false,
      properties: {
        x: { type: "string" },
      },
    };
    const { port } = await client.exposePort({
      offerId: offer.id,
      port: { id: "", type: "slot", promise: "p", ref: "" },
      bind_policy: policy,
    });
    const pr = await client.getPortBindPolicy({ portId: port.id });
    expect(pr.result.kind).toBe("found");
    if (pr.result.kind === "found") {
      expect(pr.result.bind_policy).toEqual(policy);
    }
  });

  test("setOfferExpiredNow cascades to exposed ports", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Carol" });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", type: "step" },
      bindPortId: "",
      bind_payload: null,
    });
    const { port } = await client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        type: "slot",
        promise: "",
        ref: "",
      },
    });
    await client.setOfferExpiredNow(offer.id);
    const pw = await client.getNbcBindWindowForPort(port.id);
    expect(pw.result.kind).toBe("window");
    if (pw.result.kind === "window") {
      expect(pw.result.window.nbc_expires_turn).toBe(0);
      expect(pw.result.window.nbc_expires_at_relay_ms).toBe(1);
    }
  });
});
