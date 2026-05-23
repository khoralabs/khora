import { describe, expect, test } from "bun:test";
import { zAtriumPost, zAtriumPostCreate } from "./atrium-post.ts";

const SIG = "dGVzdC1zaWduYXR1cmU";

describe("zAtriumPostCreate", () => {
  test("minimal post body", () => {
    const v = zAtriumPostCreate.parse({ body: "hello", authorSignature: SIG });
    expect(v.kind).toBe("post");
    expect(v.body).toBe("hello");
  });

  test("status shape without author allowed at create schema", () => {
    const v = zAtriumPostCreate.parse({ kind: "status", body: "On call", authorSignature: SIG });
    expect(v.kind).toBe("status");
  });

  test("full AtriumPost requires author for status", () => {
    expect(() =>
      zAtriumPost.parse({
        id: "s1",
        kind: "status",
        body: "b",
      }),
    ).toThrow();
  });

  test("full AtriumPost accepts status with author", () => {
    const p = zAtriumPost.parse({
      id: "s1",
      kind: "status",
      body: "Working",
      authorProfileId: "prof-1",
      authorSignature: SIG,
    });
    expect(p.kind).toBe("status");
  });

  test("post accepts expiresAtMs", () => {
    const v = zAtriumPost.parse({
      id: "p1",
      kind: "post",
      body: "hello",
      authorSignature: SIG,
      expiresAtMs: 1_700_000_000_000,
    });
    expect(v.expiresAtMs).toBe(1_700_000_000_000);
  });
});
