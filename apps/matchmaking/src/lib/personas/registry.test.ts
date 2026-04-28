import { expect, test } from "bun:test";
import { matchmakingPersonas } from "./index.ts";
import { MATCHMAKING_SIM_PERSONA_SLUGS } from "./slugs.ts";

test("sim persona catalog has five entries aligned with slugs", () => {
  expect(MATCHMAKING_SIM_PERSONA_SLUGS.length).toBe(5);
  expect(Object.keys(matchmakingPersonas).length).toBe(5);
  for (const slug of MATCHMAKING_SIM_PERSONA_SLUGS) {
    expect(matchmakingPersonas[slug].slug).toBe(slug);
  }
});
