import { describe, expect, test } from "bun:test";
import { createInMemoryObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { collectNbcChainGraph } from "./nbc-chain-graph";

describe("collectNbcChainGraph", () => {
  test("collects offers, ports, exposes from persistence client", async () => {
    const client = createInMemoryObpPersistenceClient();
    const { party } = await client.registerParty({ name: "Issuer" });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", type: "opening" },
      nbc_expires_turn: 99,
      nbc_expires_at_relay_ms: 0,
      bindPortId: "",
      bind_payload: null,
    });
    const { port } = await client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        type: "slot",
        promise: "Do thing",
        ref: "",
      },
      nbc_expires_turn: 99,
      nbc_expires_at_relay_ms: 0,
      bind_policy: {
        type: "object",
        additionalProperties: false,
        required: ["slot"],
        properties: {
          slot: { type: "string", const: "v" },
        },
      },
    });

    const g = await collectNbcChainGraph(client, { timing: { turnSeq: 1, relayTsMs: 1 } });

    expect(g.parties.some((p) => p.id === party.id)).toBe(true);
    expect(g.offers.some((o) => o.id === offer.id)).toBe(true);
    expect(g.ports.some((p) => p.id === port.id)).toBe(true);
    expect(g.exposes.some((e) => e.offerId === offer.id && e.portId === port.id)).toBe(true);
    expect(g.binds).toEqual([]);
    const pr = g.ports.find((p) => p.id === port.id);
    expect(pr?.bindCount).toBe(0);
    expect(pr?.exposedOnOfferIds).toEqual([offer.id]);
    expect(pr?.expired).toBe(false);
    expect(pr?.bind_policy).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["slot"],
      properties: {
        slot: { type: "string", const: "v" },
      },
    });
  });
});
