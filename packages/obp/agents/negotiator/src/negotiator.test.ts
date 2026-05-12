import { describe, expect, test } from "bun:test";
import { createAgentRegistry } from "@khoralabs/agent-identity";
import { defineObpNegotiatorIdentity } from "./identity.ts";
import { obpNegotiatorBaseInstruction } from "./instructions.ts";
import {
  ensureObpNegotiatorAgentRegistered,
  getObpNegotiatorAgentDefinition,
} from "./negotiator-session.ts";

describe("@khoralabs/obp-negotiator", () => {
  test("obpNegotiatorBaseInstruction is non-empty", () => {
    expect(obpNegotiatorBaseInstruction.length).toBeGreaterThan(100);
    expect(obpNegotiatorBaseInstruction).toContain("OBP");
  });

  test("defineObpNegotiatorIdentity returns identity", async () => {
    const { identity } = await defineObpNegotiatorIdentity("test-ns", { name: "TestNegotiator" });
    expect(identity.agentId).toBe("obp-negotiator-test-ns");
    expect(identity.name).toBe("TestNegotiator");
    expect(identity.staticInstructions.length).toBeGreaterThan(0);
  });

  test("getObpNegotiatorAgentDefinition includes session runner", async () => {
    const d = await getObpNegotiatorAgentDefinition("def-ns");
    expect(d.registerOptions.run).toBeTypeOf("function");
  });

  test("ensureObpNegotiatorAgentRegistered is idempotent on registry", async () => {
    const registry = createAgentRegistry();
    const a = await ensureObpNegotiatorAgentRegistered(registry, "idem");
    const b = await ensureObpNegotiatorAgentRegistered(registry, "idem");
    expect(a.identity.agentId).toBe(b.identity.agentId);
    expect(a.staticHash).toBe(b.staticHash);
  });
});
