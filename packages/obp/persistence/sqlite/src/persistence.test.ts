import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { ObpClient, ObpError } from "@cfd/obp-core";
import { createObpSqlitePersistence, initObpSchema } from "./index";

describe("ObpSqlitePersistence", () => {
  test("registerParty and getParty", () => {
    const db = new Database(":memory:");
    initObpSchema(db);
    const p = createObpSqlitePersistence(db, { now: () => 1000 });
    const { party } = p.registerParty({ name: "Acme", sourcemaps: [] });
    expect(party.name).toBe("Acme");
    const g = p.getParty(party.id);
    expect(g.kind).toBe("found");
    if (g.kind === "found") expect(g.party.id).toBe(party.id);
  });

  test("extendOffer + exposePort + bindPort happy path via ObpClient", () => {
    const db = new Database(":memory:");
    initObpSchema(db);
    const persistence = createObpSqlitePersistence(db, { now: () => 100 });
    const c = new ObpClient(persistence, { now: () => 100 });
    const { party } = c.registerParty({ name: "P", sourcemaps: [] });
    const { offer: o1 } = c.extendOffer({
      partyId: party.id,
      offer: {
        id: "",
        ts_created: 100,
        ts_expired: 10_000,
        type: "step",
        sourcemaps: [],
      },
      bindPortId: "",
    });
    const { port } = c.exposePort({
      offerId: o1.id,
      port: {
        id: "",
        ts_created: 100,
        ts_expired: 10_000,
        type: "t",
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
        ts_expired: 10_000,
        type: "step2",
        sourcemaps: [],
      },
      bindPortId: port.id,
    });
    expect(persistence.listBinds().length).toBe(1);
  });

  test("extendOffer with bind to unexposed port throws", () => {
    const db = new Database(":memory:");
    initObpSchema(db);
    const persistence = createObpSqlitePersistence(db, { now: () => 100 });
    const c = new ObpClient(persistence, { now: () => 100 });
    const { party } = c.registerParty({ name: "P", sourcemaps: [] });
    c.extendOffer({
      partyId: party.id,
      offer: {
        id: "o1",
        ts_created: 100,
        ts_expired: 10_000,
        type: "s",
        sourcemaps: [],
      },
      bindPortId: "",
    });
    // Port row without EXPOSES (staging) — not bindable per spec.
    db.run(
      `INSERT INTO obp_ports (id, ts_created, ts_expired, type, max_bindings, terminal, ref, sourcemaps_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["orphan", 100, 10_000, "t", 5, 0, "", "[]"],
    );
    expect(() =>
      c.extendOffer({
        partyId: party.id,
        offer: {
          id: "o2",
          ts_created: 100,
          ts_expired: 10_000,
          type: "s",
          sourcemaps: [],
        },
        bindPortId: "orphan",
      }),
    ).toThrow(ObpError);
  });

  test("exposePort rejects missing ref target", () => {
    const db = new Database(":memory:");
    initObpSchema(db);
    const p = createObpSqlitePersistence(db, { now: () => 100 });
    const { party } = p.registerParty({ name: "P", sourcemaps: [] });
    p.extendOffer({
      partyId: party.id,
      offer: { id: "o1", ts_created: 100, ts_expired: 10_000, type: "s", sourcemaps: [] },
      bindPortId: "",
    });
    expect(() =>
      p.exposePort({
        offerId: "o1",
        port: {
          id: "x",
          ts_created: 100,
          ts_expired: 10_000,
          type: "t",
          max_bindings: 2,
          terminal: false,
          ref: "does_not_exist",
          sourcemaps: [],
        },
      }),
    ).toThrow(ObpError);
  });
});
