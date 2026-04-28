import { expect, test } from "bun:test";
import { matchmakingPersonaMemoryNamespace } from "./matchmaking-persona-memory-namespace.ts";

test("persona path is cross-subject per-user personal namespace", () => {
  expect(matchmakingPersonaMemoryNamespace("mira-patel", "acct-1")).toBe(
    "obp_demo/matchmaking/users/mira-patel/personal",
  );
});
