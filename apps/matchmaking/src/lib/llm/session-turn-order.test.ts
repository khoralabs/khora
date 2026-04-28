import { describe, expect, test } from "bun:test";
import { matchmakingRoundPartyIndex } from "./session-turn-order.ts";

describe("matchmakingRoundPartyIndex", () => {
  test("no invitation: alternates A,B,A for two parties", () => {
    expect(matchmakingRoundPartyIndex(0, 2, false)).toBe(0);
    expect(matchmakingRoundPartyIndex(1, 2, false)).toBe(1);
    expect(matchmakingRoundPartyIndex(2, 2, false)).toBe(0);
  });

  test("with invitation: B speaks first, then A,B,…", () => {
    expect(matchmakingRoundPartyIndex(0, 2, true)).toBe(1);
    expect(matchmakingRoundPartyIndex(1, 2, true)).toBe(0);
    expect(matchmakingRoundPartyIndex(2, 2, true)).toBe(1);
  });

  test("with invitation and three parties: offset by one", () => {
    expect(matchmakingRoundPartyIndex(0, 3, true)).toBe(1);
    expect(matchmakingRoundPartyIndex(1, 3, true)).toBe(2);
    expect(matchmakingRoundPartyIndex(2, 3, true)).toBe(0);
  });
});
