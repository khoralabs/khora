import { describe, expect, test } from "bun:test";
import { zAtriumPost, zAtriumPostCreate } from "./atrium-post.ts";

describe("zAtriumPostCreate", () => {
  test("minimal post body", () => {
    const v = zAtriumPostCreate.parse({ body: "hello" });
    expect(v.kind).toBe("post");
    expect(v.body).toBe("hello");
  });

  test("probe shape without author allowed at create schema", () => {
    const v = zAtriumPostCreate.parse({
      kind: "probe",
      body: "watch",
      matchPostKinds: ["post"],
    });
    expect(v.kind).toBe("probe");
  });

  test("full AtriumPost requires author for probe", () => {
    expect(() =>
      zAtriumPost.parse({
        id: "x",
        kind: "probe",
        body: "b",
      }),
    ).toThrow();
  });
});
