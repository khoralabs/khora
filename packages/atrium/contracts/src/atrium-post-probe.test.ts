import { describe, expect, test } from "bun:test";
import { atriumProbeLexicalText, zAtriumPost, zAtriumPostCreate } from "./atrium-post.ts";

describe("probe posts", () => {
  test("valid probe create", () => {
    const v = zAtriumPostCreate.parse({
      kind: "probe",
      title: "Beta program intros",
      body: "Looking for warm intros to teams running a beta program.",
      attributes: { stage: "beta", domains: ["platform"], engagementType: "intros" },
      topics: ["platform"],
    });
    expect(v.kind).toBe("probe");
    expect(v.attributes?.domains).toEqual(["platform"]);
  });

  test("rejects post with attributes", () => {
    expect(() =>
      zAtriumPostCreate.parse({
        body: "hello",
        attributes: { stage: "seed" },
      }),
    ).toThrow();
  });

  test("rejects probe without title", () => {
    expect(() =>
      zAtriumPostCreate.parse({
        kind: "probe",
        body: "desc",
        attributes: { engagementType: "intros" },
      }),
    ).toThrow();
  });

  test("atriumProbeLexicalText includes attributes", () => {
    const probe = zAtriumPost.parse({
      id: "p1",
      kind: "probe",
      title: "Design pilots",
      body: "Seeking design partners.",
      authorProfileId: "prof-1",
      topics: ["platform"],
      attributes: { domains: ["platform"], engagementType: "pilots" },
    });
    const text = atriumProbeLexicalText(probe);
    expect(text).toContain("Design pilots");
    expect(text).toContain("#platform");
    expect(text).toContain("domains: platform");
    expect(text).toContain("engagement: pilots");
  });
});
