import { describe, expect, test } from "bun:test";
import type { Port } from "../model/types";
import { resolveCanonicalPortId } from "./ref";

function port(p: Partial<Port> & Pick<Port, "id" | "ref">): Port {
  return {
    ts_created: 0,
    ts_expired: 1e15,
    type: "t",
    promise: "test port",
    max_bindings: 10,
    terminal: false,
    sourcemaps: [],
    ...p,
  };
}

describe("resolveCanonicalPortId", () => {
  test("empty ref is canonical", () => {
    const ports = new Map<string, Port>([["a", port({ id: "a", ref: "" })]]);
    const r = resolveCanonicalPortId(ports, "a");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonicalId).toBe("a");
  });

  test("follows ref chain", () => {
    const ports = new Map<string, Port>([
      ["a", port({ id: "a", ref: "" })],
      ["b", port({ id: "b", ref: "a" })],
      ["c", port({ id: "c", ref: "b" })],
    ]);
    const r = resolveCanonicalPortId(ports, "c");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonicalId).toBe("a");
  });

  test("detects cycle", () => {
    const ports = new Map<string, Port>([
      ["a", port({ id: "a", ref: "b" })],
      ["b", port({ id: "b", ref: "a" })],
    ]);
    const r = resolveCanonicalPortId(ports, "a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cycle");
  });

  test("missing ref target", () => {
    const ports = new Map<string, Port>([["a", port({ id: "a", ref: "missing" })]]);
    const r = resolveCanonicalPortId(ports, "a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing");
  });
});
