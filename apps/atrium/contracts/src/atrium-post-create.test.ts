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

  test("probe may match status incoming kind", () => {
    const v = zAtriumPostCreate.parse({
      kind: "probe",
      body: "watch",
      matchPostKinds: ["status"],
    });
    expect(v.matchPostKinds).toEqual(["status"]);
  });

  test("status shape without author allowed at create schema", () => {
    const v = zAtriumPostCreate.parse({ kind: "status", body: "On call" });
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
    });
    expect(p.kind).toBe("status");
  });
});
