import { describe, expect, test } from "bun:test";
import type { PortBindPolicy } from "@khoralabs/obp-core/bind-policy";
import { ObpError } from "@khoralabs/obp-core/obp-error";
import { FakeObpPersistence } from "./fake-obp-persistence.ts";
import { OBPPersistenceClient } from "./obp-persistence-client.ts";

const seq = () => 100;

describe("OBPPersistenceClient + FakeObpPersistence", () => {
  test("registerParty rejects empty name", () => {
    const p = new FakeObpPersistence(seq);
    const c = new OBPPersistenceClient({ persistence: p, ledgerSeq: seq });
    expect(() => c.registerParty({ name: "  ", sourcemaps: [] })).toThrow(ObpError);
  });

  test("extendOffer with bind requires exposed port", () => {
    const p = new FakeObpPersistence(seq);
    const c = new OBPPersistenceClient({ persistence: p, ledgerSeq: seq });
    const { party } = c.registerParty({ name: "P", sourcemaps: [] });
    p.ports.set("port1", {
      id: "port1",
      created_seq: 100,
      expires_seq: 1000,
      type: "t",
      promise: "Staging port for test.",
      max_bindings: 5,
      terminal: false,
      ref: "",
      sourcemaps: [],
    });
    // not exposed
    expect(() =>
      c.extendOffer({
        partyId: party.id,
        offer: {
          id: "",
          created_seq: 100,
          expires_seq: 1000,
          type: "t",
          sourcemaps: [],
        },
        bindPortId: "port1",
      }),
    ).toThrow(ObpError);
  });

  test("happy path: expose then extend with bind", () => {
    const p = new FakeObpPersistence(seq);
    const c = new OBPPersistenceClient({ persistence: p, ledgerSeq: seq });
    const { party } = c.registerParty({ name: "Acme", sourcemaps: [] });
    const { offer: created } = c.extendOffer({
      partyId: party.id,
      offer: {
        id: "",
        created_seq: 100,
        expires_seq: 1000,
        type: "step",
        sourcemaps: [],
      },
      bindPortId: "",
    });
    expect(c.getExtendingPartyId(created.id)).toBe(party.id);
    const { port } = c.exposePort({
      offerId: created.id,
      port: {
        id: "",
        created_seq: 100,
        expires_seq: 1000,
        type: "p",
        promise: "Exposed port p.",
        max_bindings: 5,
        terminal: false,
        ref: "",
        sourcemaps: [],
      },
    });
    c.extendOffer({
      partyId: party.id,
      offer: {
        id: "",
        created_seq: 100,
        expires_seq: 1000,
        type: "step2",
        sourcemaps: [],
      },
      bindPortId: port.id,
    });
    expect(p.listBinds().length).toBe(1);
  });

  test("extendOffer with bind validates counterparty_bind against port bind_policy", () => {
    const pol: PortBindPolicy = {
      version: "1",
      properties: [{ type: "boolean", name: "Agree", prompt: "Accept terms" }],
    };
    const fake = new FakeObpPersistence(seq);
    const c = new OBPPersistenceClient({ persistence: fake, ledgerSeq: seq });
    const { party } = c.registerParty({ name: "P", sourcemaps: [] });
    const { offer: o0 } = c.extendOffer({
      partyId: party.id,
      bindPortId: "",
      offer: {
        id: "",
        created_seq: 100,
        expires_seq: 1000,
        type: "root",
        sourcemaps: [],
      },
    });
    const { port } = c.exposePort({
      offerId: o0.id,
      port: {
        id: "",
        created_seq: 100,
        expires_seq: 1000,
        type: "gate",
        promise: "Gate with bind policy.",
        max_bindings: 1,
        terminal: false,
        ref: "",
        sourcemaps: [],
        bind_policy: pol,
      },
    });
    expect(() =>
      c.extendOffer({
        partyId: party.id,
        bindPortId: port.id,
        offer: {
          id: "",
          created_seq: 100,
          expires_seq: 1000,
          type: "next",
          sourcemaps: [],
        },
      }),
    ).toThrow(ObpError);

    c.extendOffer({
      partyId: party.id,
      bindPortId: port.id,
      counterparty_bind: { agree: true },
      offer: {
        id: "",
        created_seq: 100,
        expires_seq: 1000,
        type: "next",
        sourcemaps: [],
      },
    });
    const binds = fake.listBinds();
    expect(binds.length).toBe(1);
    expect(binds[0]?.counterparty_bind).toEqual({ agree: true });
    expect(binds[0]?.bind_policy_snapshot).toEqual(pol);
  });

  test("single-arg constructor uses FakeObpPersistence by default", () => {
    const seqVal = 100;
    const c = new OBPPersistenceClient({ ledgerSeq: () => seqVal });
    const { party } = c.registerParty({ name: "solo", sourcemaps: [] });
    expect(party.name).toBe("solo");
    const { offer } = c.extendOffer({
      partyId: party.id,
      bindPortId: "",
      offer: {
        id: "",
        created_seq: seqVal,
        expires_seq: 1000,
        type: "root",
        sourcemaps: [],
      },
    });
    expect(offer.type).toBe("root");
  });
});
