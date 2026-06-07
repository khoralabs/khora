import { describe, expect, test } from "bun:test";
import { ObpError } from "@khoralabs/obp-errors";
import {
  canonicalSessionParties,
  normalizeSessionInit,
  partyIdForSigner,
  sessionInitFromUnknownWireEnvelope,
  sessionInitFromUnknownWireRecord,
  sessionInitFromWire,
  sessionInitToWire,
} from "./frame-init-wire";
import type { SessionInitNormalized, SessionParty } from "./frame-protocol-types";
import { toSha256HexLower } from "./frame-protocol-types";

const gh = toSha256HexLower("a".repeat(64));

const pA: SessionParty = { id: "party-a", pubkey: "0x02" };
const pB: SessionParty = { id: "party-b", pubkey: "0x01" };

describe("canonicalSessionParties", () => {
  test("orders by ascending pubkey hex string", () => {
    const [first] = canonicalSessionParties([pA, pB]);
    expect(first.pubkey).toBe("0x01");
  });

  test("duplicate pubkey throws", () => {
    expect(() =>
      canonicalSessionParties([
        { id: "1", pubkey: "0x01" },
        { id: "2", pubkey: "0x01" },
      ]),
    ).toThrow(ObpError);
  });
});

describe("normalizeSessionInit", () => {
  test("canonicalizes party order", () => {
    const init: SessionInitNormalized = {
      session_id: "s1",
      genesis_hash: gh,
      parties: [pA, pB],
    };
    const n = normalizeSessionInit(init);
    expect(n.parties[0].pubkey).toBe("0x01");
    expect(n.parties[1].pubkey).toBe("0x02");
  });
});

describe("partyIdForSigner", () => {
  test("returns id for signer pubkey", () => {
    const init: SessionInitNormalized = {
      session_id: "s",
      genesis_hash: gh,
      parties: [pB, pA],
    };
    expect(partyIdForSigner(init, "0x01")).toBe("party-b");
  });

  test("unknown signer throws", () => {
    const init: SessionInitNormalized = {
      session_id: "s",
      genesis_hash: gh,
      parties: [pA, pB],
    };
    expect(() => partyIdForSigner(init, "0xff")).toThrow(ObpError);
  });
});

describe("sessionInit wire roundtrip", () => {
  test("toWire and fromWire", () => {
    const init: SessionInitNormalized = {
      session_id: "sid",
      genesis_hash: gh,
      parties: [pB, pA],
    };
    const wire = sessionInitToWire(init);
    expect(wire.party_ids).toEqual(["party-b", "party-a"]);
    expect(wire.actor_pubkeys).toEqual(["0x01", "0x02"]);
    const back = sessionInitFromWire(wire);
    expect(back.session_id).toBe("sid");
    expect(back.parties[0].pubkey).toBe("0x01");
  });
});

describe("sessionInitFromUnknownWireRecord", () => {
  test("accepts actors alias", () => {
    const init = sessionInitFromUnknownWireRecord({
      session_id: "s",
      genesis_hash: gh,
      party_ids: ["a", "b"],
      actors: ["0x01", "0x02"],
    });
    expect(init.session_id).toBe("s");
    expect(init.parties[0].id).toBe("a");
  });

  test("bad shape throws", () => {
    expect(() =>
      sessionInitFromUnknownWireRecord({
        session_id: "s",
        genesis_hash: gh,
        party_ids: ["a"],
        actor_pubkeys: ["0x01"],
      }),
    ).toThrow(ObpError);
  });
});

describe("sessionInitFromUnknownWireEnvelope", () => {
  test("unwraps init", () => {
    const init = sessionInitFromUnknownWireEnvelope({
      init: {
        session_id: "s",
        genesis_hash: gh,
        party_ids: ["a", "b"],
        actor_pubkeys: ["0x01", "0x02"],
      },
    });
    expect(init.session_id).toBe("s");
  });

  test("missing init throws", () => {
    expect(() => sessionInitFromUnknownWireEnvelope({})).toThrow(ObpError);
  });
});
