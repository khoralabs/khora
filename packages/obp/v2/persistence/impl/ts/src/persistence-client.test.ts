/**
 * Tests for `ObpPersistenceClient` using a minimal in-memory strategy.
 * The in-memory strategy also validates the strategy interface contract.
 */

import { describe, expect, test } from "bun:test";
import { ObpError } from "@khoralabs/obp-v2-errors";
import { createInMemoryObpPersistenceClient } from "./in-memory-strategy.ts";

function makeClient() {
  return createInMemoryObpPersistenceClient();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ObpPersistenceClient invariant 4", () => {
  test("rejects empty name", () => {
    const client = makeClient();
    expect(() => client.registerParty({ name: "  " })).toThrow(ObpError);
  });

  test("rejects blank name", () => {
    const client = makeClient();
    expect(() => client.registerParty({ name: "" })).toThrow(ObpError);
  });
});

describe("registerParty + getPartyOrNull", () => {
  test("roundtrip", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Alice" });
    expect(party.name).toBe("Alice");
    const found = await client.getPartyOrNull(party.id);
    expect(found?.name).toBe("Alice");
    expect(await client.getPartyOrNull("missing")).toBeNull();
  });
});

describe("extendOffer + getExtendingPartyId", () => {
  test("associates party to offer", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Bob" });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", type: "step" },
      bindPortId: "",
      bind_payload: null,
    });
    expect(await client.getExtendingPartyId(offer.id)).toBe(party.id);
    expect(await client.getExtendingPartyId("unknown")).toBeNull();
  });
});

describe("exposePort + isPortExposed", () => {
  test("port exposed after exposePort", async () => {
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
        promise: "fill me",
        ref: "",
      },
    });
    expect((await client.isPortExposed(port.id)).exposed).toBe(true);
    expect((await client.isPortExposed("ghost")).exposed).toBe(false);
  });
});

describe("bindPort + listBinds", () => {
  test("records bind row", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Dave" });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", type: "step" },
      bindPortId: "",
      bind_payload: null,
    });
    const { port } = await client.exposePort({
      offerId: offer.id,
      port: { id: "", type: "slot", promise: "p", ref: "" },
    });
    await client.bindPort({ offerId: offer.id, portId: port.id, bind_payload: null });
    const { binds } = await client.listBinds();
    expect(binds.some((b) => b.portId === port.id)).toBe(true);
  });
});

describe("getPortsSnapshot", () => {
  test("returns exposed ports", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Eve" });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", type: "step" },
      bindPortId: "",
      bind_payload: null,
    });
    await client.exposePort({
      offerId: offer.id,
      port: { id: "", type: "slot", promise: "p", ref: "" },
    });
    const snap = await client.getPortsSnapshot();
    expect(snap.entries.length).toBeGreaterThan(0);
  });
});

describe("getPartyOutput result union", () => {
  test("notFound kind", async () => {
    const client = makeClient();
    const out = await client.getParty({ id: "nope" });
    expect(out.result.kind).toBe("notFound");
  });
});
