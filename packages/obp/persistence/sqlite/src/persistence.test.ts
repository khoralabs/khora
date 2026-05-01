import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { ObpClient, ObpError, type PortBindPolicy } from "@cfd/obp-core";
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
    expect(c.getExtendingPartyId(o1.id)).toBe(party.id);
    const { port } = c.exposePort({
      offerId: o1.id,
      port: {
        id: "",
        ts_created: 100,
        ts_expired: 10_000,
        type: "t",
        description: "Test port t.",
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
          description: "Ref target test.",
          max_bindings: 2,
          terminal: false,
          ref: "does_not_exist",
          sourcemaps: [],
        },
      }),
    ).toThrow(ObpError);
  });

  test("listExposedPortEdges and expire port blocks bind", () => {
    const db = new Database(":memory:");
    initObpSchema(db);
    const persistence = createObpSqlitePersistence(db, { now: () => 500 });
    const c = new ObpClient(persistence, { now: () => 500 });
    const { party } = c.registerParty({ name: "A", sourcemaps: [] });
    const { offer } = c.extendOffer({
      partyId: party.id,
      bindPortId: "",
      offer: {
        id: "",
        ts_created: 500,
        ts_expired: 99_999,
        type: "deal",
        sourcemaps: [],
      },
    });
    const { port } = c.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        ts_created: 500,
        ts_expired: 99_999,
        type: "slot",
        description: "Bindable slot.",
        max_bindings: 1,
        terminal: false,
        ref: "",
        sourcemaps: [],
      },
    });
    expect(persistence.listExposedPortEdges().some((e) => e.portId === port.id)).toBe(true);
    persistence.setPortExpiredNow(port.id);
    const pr = c.getPort(port.id);
    expect(pr.kind).toBe("found");
    if (pr.kind === "found") {
      expect(pr.port.ts_expired).toBe(500);
    }
    expect(() => c.bindPort({ offerId: offer.id, portId: port.id })).toThrow(ObpError);
  });

  test("setOfferExpiredNow cascades port expiry", () => {
    const db = new Database(":memory:");
    initObpSchema(db);
    const persistence = createObpSqlitePersistence(db, { now: () => 700 });
    const c = new ObpClient(persistence, { now: () => 700 });
    const { party } = c.registerParty({ name: "P", sourcemaps: [] });
    const { offer } = c.extendOffer({
      partyId: party.id,
      bindPortId: "",
      offer: {
        id: "",
        ts_created: 700,
        ts_expired: 99_999,
        type: "o",
        sourcemaps: [],
      },
    });
    const { port } = c.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        ts_created: 700,
        ts_expired: 99_999,
        type: "p",
        description: "Terminal p.",
        max_bindings: 1,
        terminal: true,
        ref: "",
        sourcemaps: [],
      },
    });
    persistence.setOfferExpiredNow(offer.id);
    const or = c.getOffer(offer.id);
    expect(or.kind).toBe("found");
    if (or.kind === "found") {
      expect(or.offer.ts_expired).toBe(700);
    }
    const pr = c.getPort(port.id);
    expect(pr.kind).toBe("found");
    if (pr.kind === "found") {
      expect(pr.port.ts_expired).toBe(700);
    }
  });

  test("bind_policy on port and counterparty_bind on bind round-trip", () => {
    const pol: PortBindPolicy = {
      version: "1",
      properties: [{ type: "text", name: "Code", prompt: "x", constraints: { minLength: 1 } }],
    };
    const db = new Database(":memory:");
    initObpSchema(db);
    const persistence = createObpSqlitePersistence(db, { now: () => 100 });
    const c = new ObpClient(persistence, { now: () => 100 });
    const { party } = c.registerParty({ name: "P", sourcemaps: [] });
    const { offer } = c.extendOffer({
      partyId: party.id,
      bindPortId: "",
      offer: {
        id: "",
        ts_created: 100,
        ts_expired: 10_000,
        type: "root",
        sourcemaps: [],
      },
    });
    const { port } = c.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        ts_created: 100,
        ts_expired: 10_000,
        type: "gate",
        description: "Gate with policy.",
        max_bindings: 1,
        terminal: false,
        ref: "",
        sourcemaps: [],
        bind_policy: pol,
      },
    });
    const gpr = c.getPort(port.id);
    expect(gpr.kind).toBe("found");
    if (gpr.kind === "found") {
      expect(gpr.port.bind_policy).toEqual(pol);
    }
    c.extendOffer({
      partyId: party.id,
      bindPortId: port.id,
      counterparty_bind: { code: "abc" },
      offer: {
        id: "",
        ts_created: 100,
        ts_expired: 10_000,
        type: "next",
        sourcemaps: [],
      },
    });
    const binds = persistence.listBinds();
    expect(binds.length).toBe(1);
    expect(binds[0]?.counterparty_bind).toEqual({ code: "abc" });
    expect(binds[0]?.bind_policy).toEqual(pol);
  });
});
