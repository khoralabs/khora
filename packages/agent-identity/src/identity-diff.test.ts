import { describe, expect, test } from "bun:test";
import {
  diffIdentityLinks,
  diffToolRefs,
  explainIdentityLinkRelationship,
  formatHashShort,
  type IdentityLinkField,
} from "./identity-diff.js";
import type { IdentityLink } from "./identity-link.js";

describe("formatHashShort", () => {
  test("abbreviates long hex", () => {
    const h = "a".repeat(64);
    expect(formatHashShort(h)).toBe("aaaaaa…aaaaaa");
  });
  test("returns short strings as-is", () => {
    expect(formatHashShort("abc")).toBe("abc");
  });
  test("empty string", () => {
    expect(formatHashShort("")).toBe("");
  });
});

describe("diffToolRefs", () => {
  test("detects only-in-first, only-in-second, hash changed", () => {
    const a = [
      { toolKey: "x", toolHash: "01" },
      { toolKey: "y", toolHash: "02" },
    ];
    const b = [
      { toolKey: "y", toolHash: "99" },
      { toolKey: "z", toolHash: "03" },
    ];
    const d = diffToolRefs(a, b);
    expect(d.onlyInFirst).toEqual([{ toolKey: "x", toolHash: "01" }]);
    expect(d.onlyInSecond).toEqual([{ toolKey: "z", toolHash: "03" }]);
    expect(d.hashChanged).toEqual([
      { toolKey: "y", firstHash: "02", secondHash: "99" },
    ]);
  });
});

describe("diffIdentityLinks", () => {
  test("all unchanged when equal", () => {
    const x: IdentityLink = {
      agentId: "a",
      agentName: "A",
      staticHash: "s",
      runtimeHash: "r",
    };
    const d = diffIdentityLinks(x, { ...x });
    expect(d.changed).toEqual([]);
    const allFields: IdentityLinkField[] = [
      "agentId",
      "agentName",
      "staticHash",
      "runtimeHash",
    ];
    expect([...d.unchanged].sort()).toEqual([...allFields].sort());
  });

  test("lists changed fields", () => {
    const a: IdentityLink = {
      agentId: "a",
      agentName: "A",
      staticHash: "s1",
      runtimeHash: "r1",
    };
    const b: IdentityLink = { ...a, runtimeHash: "r2" };
    const d = diffIdentityLinks(a, b);
    expect(d.unchanged).not.toContain("runtimeHash");
    expect(d.changed.map((c) => c.field)).toContain("runtimeHash");
  });
});

describe("explainIdentityLinkRelationship", () => {
  const base = (): IdentityLink => ({
    agentId: "a",
    agentName: "A",
    staticHash: "s",
    runtimeHash: "r",
  });

  test("same", () => {
    const x = base();
    expect(explainIdentityLinkRelationship(x, { ...x })).toBe(
      "Same identity link.",
    );
  });

  test("different agent id", () => {
    expect(
      explainIdentityLinkRelationship(base(), {
        ...base(),
        agentId: "b",
      }),
    ).toBe("Different agent ids.");
  });

  test("same static different runtime", () => {
    expect(
      explainIdentityLinkRelationship(base(), {
        ...base(),
        runtimeHash: "r2",
      }),
    ).toContain("runtime differs");
  });

  test("different static", () => {
    expect(
      explainIdentityLinkRelationship(base(), {
        ...base(),
        staticHash: "s2",
      }),
    ).toContain("static identity");
  });
});
