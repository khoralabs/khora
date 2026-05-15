import { describe, expect, test } from "bun:test";
import type { JsonDocument, Offer, Port } from "@khoralabs/obp-v2-model";
import { validateVellumBindPayloadForPort } from "@khoralabs/vellum-bind-policy";
import { validateNbcBind } from "./nbc-invariants.ts";
import { resolveCanonicalPortId } from "./nbc-ref.ts";

function vellumBindValidate(
  bindPolicy: JsonDocument | null,
  bindPayload: JsonDocument | null,
): JsonDocument {
  return validateVellumBindPayloadForPort(bindPolicy, bindPayload) as JsonDocument;
}

const textBindPolicy = {
  version: "1" as const,
  properties: [
    {
      type: "text" as const,
      name: "Greeting",
      prompt: "A short hello",
      constraints: { minLength: 1 },
    },
  ],
};

const basePortFields = { type: "t" as const, promise: "", sourcemaps: [] as const };

const win = (turn: number, relay: number) => ({
  nbc_expires_turn: turn,
  nbc_expires_at_relay_ms: relay,
});

describe("resolveCanonicalPortId", () => {
  test("resolves empty ref", () => {
    const p: Port = {
      id: "a",
      ...basePortFields,
      ref: "",
    };
    const m = new Map<string, Port>([["a", p]]);
    expect(resolveCanonicalPortId(m, "a")).toEqual({ ok: true, canonicalId: "a", path: ["a"] });
  });

  test("detects cycle", () => {
    const a: Port = {
      id: "a",
      ...basePortFields,
      ref: "b",
    };
    const b: Port = {
      id: "b",
      ...basePortFields,
      ref: "a",
    };
    const m = new Map<string, Port>([
      ["a", a],
      ["b", b],
    ]);
    const r = resolveCanonicalPortId(m, "a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cycle");
  });
});

describe("validateNbcBind", () => {
  const offer: Offer = {
    id: "o1",
    type: "step",
    sourcemaps: [],
  };
  const port: Port = {
    id: "p1",
    type: "slot",
    promise: "x",
    ref: "",
    sourcemaps: [],
  };
  const ports = new Map<string, Port>([["p1", port]]);

  test("N1 rejects expired offer (turn)", async () => {
    const r = await validateNbcBind({
      timing: { turnSeq: 50, relayTsMs: 1 },
      offer,
      port,
      offerBindWindow: win(50, 0),
      portBindWindow: win(100, 0),
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: null,
      bindPayload: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toEqual({ code: "EXPIRED", entity: "offer" });
  });

  test("N1 skips when both expiry modes off", async () => {
    const r = await validateNbcBind({
      timing: { turnSeq: 999, relayTsMs: 999 },
      offer,
      port,
      offerBindWindow: win(0, 0),
      portBindWindow: win(0, 0),
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: null,
      bindPayload: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalizedBindPayload).toBeNull();
  });

  test("N1 rejects relay expiry without relay ts", async () => {
    const r = await validateNbcBind({
      timing: { turnSeq: 0, relayTsMs: 0 },
      offer,
      port,
      offerBindWindow: win(0, 100),
      portBindWindow: win(0, 0),
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: null,
      bindPayload: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toEqual({ code: "EXPIRED", entity: "offer" });
  });

  test("NOT_EXPOSED", async () => {
    const r = await validateNbcBind({
      timing: { turnSeq: 0, relayTsMs: 1 },
      offer,
      port,
      offerBindWindow: win(100, 0),
      portBindWindow: win(100, 0),
      portsById: ports,
      targetPortIsExposed: false,
      bindPolicy: null,
      bindPayload: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toEqual({ code: "NOT_EXPOSED" });
  });

  test("N4 rejects bind_payload when no policy", async () => {
    const r = await validateNbcBind({
      timing: { turnSeq: 0, relayTsMs: 1 },
      offer,
      port,
      offerBindWindow: win(100, 0),
      portBindWindow: win(100, 0),
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: null,
      bindPayload: { x: 1 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe("POLICY_REJECTED");
  });

  test("N4 rejects invalid policy document (host validator)", async () => {
    const r = await validateNbcBind({
      timing: { turnSeq: 0, relayTsMs: 1 },
      offer,
      port,
      offerBindWindow: win(100, 0),
      portBindWindow: win(100, 0),
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: { required: true },
      bindPayload: { ok: true },
      validateBindPayload: vellumBindValidate,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe("POLICY_REJECTED");
  });

  test("N4 rejects active bind_policy without host validator", async () => {
    const r = await validateNbcBind({
      timing: { turnSeq: 0, relayTsMs: 1 },
      offer,
      port,
      offerBindWindow: win(100, 0),
      portBindWindow: win(100, 0),
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: textBindPolicy,
      bindPayload: { greeting: "yo" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.code).toBe("POLICY_REJECTED");
      expect(String("reason" in r.failure ? r.failure.reason : "")).toContain("validateBindPayload");
    }
  });

  test("N4 success with schema bind_payload", async () => {
    const r = await validateNbcBind({
      timing: { turnSeq: 0, relayTsMs: 1 },
      offer,
      port,
      offerBindWindow: win(100, 0),
      portBindWindow: win(100, 0),
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: textBindPolicy,
      bindPayload: { greeting: "yo" },
      validateBindPayload: vellumBindValidate,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalizedBindPayload).toEqual({ greeting: "yo" });
  });

  test("N4 rejects missing required field", async () => {
    const r = await validateNbcBind({
      timing: { turnSeq: 0, relayTsMs: 1 },
      offer,
      port,
      offerBindWindow: win(100, 0),
      portBindWindow: win(100, 0),
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: textBindPolicy,
      bindPayload: {},
      validateBindPayload: vellumBindValidate,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe("POLICY_REJECTED");
  });
});
