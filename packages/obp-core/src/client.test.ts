import { describe, expect, test } from "bun:test";
import { ObpClient } from "./client";
import { ObpError } from "./errors";
import { FakeObpPersistence } from "./testing/fake-obp-persistence";

describe("ObpClient + FakeObpPersistence", () => {
  test("registerParty rejects empty name", () => {
    const p = new FakeObpPersistence(() => 100);
    const c = new ObpClient(p);
    expect(() => c.registerParty({ name: "  ", sourcemaps: [] })).toThrow(ObpError);
  });

  test("extendOffer with bind requires exposed port", () => {
    const p = new FakeObpPersistence(() => 100);
    const c = new ObpClient(p, { now: () => 100 });
    const { party } = c.registerParty({ name: "P", sourcemaps: [] });
    p.ports.set("port1", {
      id: "port1",
      ts_created: 100,
      ts_expired: 1000,
      type: "t",
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
          ts_created: 100,
          ts_expired: 1000,
          type: "t",
          sourcemaps: [],
        },
        bindPortId: "port1",
      }),
    ).toThrow(ObpError);
  });

  test("happy path: expose then extend with bind", () => {
    const p = new FakeObpPersistence(() => 100);
    const c = new ObpClient(p, { now: () => 100 });
    const { party } = c.registerParty({ name: "Acme", sourcemaps: [] });
    const { offer: created } = c.extendOffer({
      partyId: party.id,
      offer: {
        id: "",
        ts_created: 100,
        ts_expired: 1000,
        type: "step",
        sourcemaps: [],
      },
      bindPortId: "",
    });
    const { port } = c.exposePort({
      offerId: created.id,
      port: {
        id: "",
        ts_created: 100,
        ts_expired: 1000,
        type: "p",
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
        ts_created: 100,
        ts_expired: 1000,
        type: "step2",
        sourcemaps: [],
      },
      bindPortId: port.id,
    });
    expect(p.listBinds().length).toBe(1);
  });
});
