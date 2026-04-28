import { expect, test } from "bun:test";
import { MATCHMAKING_SCENARIO_IDS } from "./index.ts";

test("pair scenarios cover five choose two", () => {
  expect(MATCHMAKING_SCENARIO_IDS.length).toBe(10);
});
