import { describe, expect, test } from "bun:test";
import { zKhoraPost, zKhoraPostCreate } from "./khora-post";

const SIG = "dGVzdC1zaWduYXR1cmU";

describe("zKhoraPostCreate", () => {
  test("minimal post body", () => {
    const v = zKhoraPostCreate.parse({ body: "hello", authorSignature: SIG });
    expect(v.kind).toBe("post");
    expect(v.body).toBe("hello");
    expect(v.fanOutPolicy).toBeUndefined();
  });

  test("catalog-pull is explicit and public-only", () => {
    expect(
      zKhoraPostCreate.parse({
        body: "large broadcast",
        fanOutPolicy: "catalog-pull",
        authorSignature: SIG,
      }).fanOutPolicy,
    ).toBe("catalog-pull");
    expect(() =>
      zKhoraPostCreate.parse({
        body: "private",
        visibility: "private",
        fanOutPolicy: "catalog-pull",
        authorSignature: SIG,
      }),
    ).toThrow(/requires public catalog visibility/);
  });

  test("status shape without author allowed at create schema", () => {
    const v = zKhoraPostCreate.parse({ kind: "status", body: "On call", authorSignature: SIG });
    expect(v.kind).toBe("status");
  });

  test("full KhoraPost requires author for status", () => {
    expect(() =>
      zKhoraPost.parse({
        id: "s1",
        kind: "status",
        body: "b",
      }),
    ).toThrow();
  });

  test("full KhoraPost accepts status with author", () => {
    const p = zKhoraPost.parse({
      id: "s1",
      kind: "status",
      body: "Working",
      authorProfileId: "prof-1",
      authorSignature: SIG,
    });
    expect(p.kind).toBe("status");
  });

  test("post accepts expiresAtMs", () => {
    const v = zKhoraPost.parse({
      id: "p1",
      kind: "post",
      body: "hello",
      authorSignature: SIG,
      expiresAtMs: 1_700_000_000_000,
    });
    expect(v.expiresAtMs).toBe(1_700_000_000_000);
  });
});
