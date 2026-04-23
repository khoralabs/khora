import { expect, test } from "bun:test";
import { matchmakingPersonaMemoryNamespace } from "./matchmaking-persona-memory-namespace.ts";

test("subject-scoped path includes slug", () => {
  expect(matchmakingPersonaMemoryNamespace("p1", "acct-1")).toBe(
    "obp_demo/matchmaking/subjects/acct-1/personas/p1",
  );
});
