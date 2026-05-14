import { describe, expect, test } from "bun:test";
import type { Offer, Port } from "@khoralabs/obp-v2-model";
import { validateNbcBind } from "./nbc-invariants.ts";
import { resolveCanonicalPortId } from "./nbc-ref.ts";

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

describe("resolveCanonicalPortId", () => {
  test("resolves empty ref", () => {
    const p: Port = {
      id: "a",
      expires_seq: 10n,
      type: "t",
      promise: "",
      ref: "",
      sourcemaps: [],
    };
    const m = new Map<string, Port>([["a", p]]);
    expect(resolveCanonicalPortId(m, "a")).toEqual({ ok: true, canonicalId: "a", path: ["a"] });
  });

  test("detects cycle", () => {
    const a: Port = { id: "a", expires_seq: 10n, type: "t", promise: "", ref: "b", sourcemaps: [] };
    const b: Port = { id: "b", expires_seq: 10n, type: "t", promise: "", ref: "a", sourcemaps: [] };
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
  const offer: Offer = { id: "o1", expires_seq: 100n, type: "step", sourcemaps: [] };
  const port: Port = {
    id: "p1",
    expires_seq: 100n,
    type: "slot",
    promise: "x",
    ref: "",
    sourcemaps: [],
  };
  const ports = new Map<string, Port>([["p1", port]]);

  test("N1 rejects expired offer", async () => {
    const f = await validateNbcBind({
      ledgerSeq: 100n,
      offer: { ...offer, expires_seq: 50n },
      port,
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: null,
      bindPayload: null,
    });
    expect(f).toEqual({ code: "EXPIRED", entity: "offer" });
  });

  test("N1 skips when expires_seq is 0", async () => {
    const f = await validateNbcBind({
      ledgerSeq: 999n,
      offer: { ...offer, expires_seq: 0n },
      port: { ...port, expires_seq: 0n },
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: null,
      bindPayload: null,
    });
    expect(f).toBeNull();
  });

  test("NOT_EXPOSED", async () => {
    const f = await validateNbcBind({
      ledgerSeq: 0n,
      offer,
      port,
      portsById: ports,
      targetPortIsExposed: false,
      bindPolicy: null,
      bindPayload: null,
    });
    expect(f).toEqual({ code: "NOT_EXPOSED" });
  });

  test("N4 rejects bind_payload when no policy", async () => {
    const f = await validateNbcBind({
      ledgerSeq: 0n,
      offer,
      port,
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: null,
      bindPayload: { x: 1 },
    });
    expect(f?.code).toBe("POLICY_REJECTED");
  });

  test("N4 rejects invalid policy document", async () => {
    const f = await validateNbcBind({
      ledgerSeq: 0n,
      offer,
      port,
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: { required: true },
      bindPayload: { ok: true },
    });
    expect(f?.code).toBe("POLICY_REJECTED");
  });

  test("N4 success with schema bind_payload", async () => {
    const f = await validateNbcBind({
      ledgerSeq: 0n,
      offer,
      port,
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: textBindPolicy,
      bindPayload: { greeting: "yo" },
    });
    expect(f).toBeNull();
  });

  test("N4 rejects missing required field", async () => {
    const f = await validateNbcBind({
      ledgerSeq: 0n,
      offer,
      port,
      portsById: ports,
      targetPortIsExposed: true,
      bindPolicy: textBindPolicy,
      bindPayload: {},
    });
    expect(f?.code).toBe("POLICY_REJECTED");
  });
});
