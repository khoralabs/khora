/**
 * Tests for **`frame-bootstrap.ts`**: **`cfd.obp.frame#SessionInit`** wire constraints only
 * (not `cfd.obp.session`).
 */

import { describe, expect, test } from "bun:test";
import { isActorPubkeysAscending, isSessionInitPartyStructure } from "./frame-bootstrap.ts";
import type { SessionInit } from "./frame-protocol-types.ts";
import { toSha256HexLower } from "./frame-protocol-types.ts";

const gh = toSha256HexLower("a".repeat(64));

describe("isSessionInitPartyStructure", () => {
  test("two party ids and pubkeys", () => {
    const init: SessionInit = {
      session_id: "s",
      party_ids: ["a", "b"],
      actor_pubkeys: ["0x01", "0x02"],
      genesis_hash: gh,
    };
    expect(isSessionInitPartyStructure(init)).toBe(true);
  });

  test("wrong lengths", () => {
    const init: SessionInit = {
      session_id: "s",
      party_ids: ["a"],
      actor_pubkeys: ["0x01", "0x02"],
      genesis_hash: gh,
    };
    expect(isSessionInitPartyStructure(init)).toBe(false);
  });
});

describe("isActorPubkeysAscending", () => {
  test("strict ascending", () => {
    expect(isActorPubkeysAscending(["0x01", "0x02"])).toBe(true);
  });

  test("equal pubkeys rejected", () => {
    expect(isActorPubkeysAscending(["0x01", "0x01"])).toBe(false);
  });

  test("wrong order", () => {
    expect(isActorPubkeysAscending(["0x02", "0x01"])).toBe(false);
  });
});
