import { describe, expect, test } from "bun:test";
import type { ResolvedSource } from "./resolve-sourcemap.ts";

describe("ResolvedSource", () => {
  test("json kind carries unparsed body", () => {
    const r: ResolvedSource = { kind: "json", body: '{"x":1}' };
    expect(r.kind).toBe("json");
    if (r.kind === "json") {
      expect(r.body).toBe('{"x":1}');
    }
  });

  test("record kind narrows value with domain", () => {
    type EM = { profile: { id: string } };
    const r: ResolvedSource<EM> = {
      kind: "record",
      domain: "profile",
      entityId: "p1",
      value: { id: "p1" },
    };
    if (r.kind === "record" && r.domain === "profile") {
      expect(r.value.id).toBe("p1");
    }
  });
});
