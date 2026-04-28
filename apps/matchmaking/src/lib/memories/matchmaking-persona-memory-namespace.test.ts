import { expect, test } from "bun:test";
import { matchmakingPersonaMemoryNamespace } from "./matchmaking-persona-memory-namespace.ts";

test("persona path is cross-subject per-user personal namespace", () => {
  expect(matchmakingPersonaMemoryNamespace("p1", "acct-1")).toBe("obp_demo/matchmaking/users/p1/personal");
});
