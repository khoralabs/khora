import { describe, expect, test } from "bun:test";
import { buildObpNegotiatorBaseInstruction } from "./instructions.ts";
import { defineObpNegotiatorIdentity } from "./identity.ts";

describe("@cfd/obp-negotiator", () => {
  test("buildObpNegotiatorBaseInstruction is non-empty", () => {
    const s = buildObpNegotiatorBaseInstruction();
    expect(s.length).toBeGreaterThan(100);
    expect(s).toContain("OBP");
  });

  test("defineObpNegotiatorIdentity returns identity", async () => {
    const { identity } = await defineObpNegotiatorIdentity("test-ns", { name: "TestNegotiator" });
    expect(identity.agentId).toBe("obp-negotiator-test-ns");
    expect(identity.name).toBe("TestNegotiator");
    expect(identity.staticInstructions.length).toBeGreaterThan(0);
  });
});
