import { expect, test } from "bun:test";
import { resolveMatchmakingNegotiatorDisplayName } from "./negotiator-display-name.ts";

test("uses display label when non-empty", () => {
  expect(
    resolveMatchmakingNegotiatorDisplayName({
      displayLabel: "  Peer  ",
      invocationHash: "abc",
      agentId: "x",
    }),
  ).toBe("Peer");
});

test("uses invocationHash slice when no label", () => {
  const h = "a".repeat(64);
  const r = resolveMatchmakingNegotiatorDisplayName({
    displayLabel: "",
    invocationHash: h,
    agentId: "x",
  });
  expect(r.startsWith("peer-")).toBe(true);
  expect(r.length).toBeLessThan(h.length + 10);
});

test("uses agentId when no invocation", () => {
  const r = resolveMatchmakingNegotiatorDisplayName({
    displayLabel: "   ",
    agentId: "obp-negotiator-demo",
  });
  expect(r.startsWith("agent-")).toBe(true);
  expect(r).toContain("…");
});
