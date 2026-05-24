import { describe, expect, test } from "bun:test";
import { zAtriumSearchResponse } from "./atrium-search.ts";

const SIG = "dGVzdC1zaWduYXR1cmU";

describe("zAtriumSearchResponse", () => {
  test("parses hit with hydrated post", () => {
    const parsed = zAtriumSearchResponse.parse({
      hits: [
        {
          _id: "sm_1",
          score: 0.42,
          memory: { _id: "mem_1", namespace: "global", key: "k", kind: "node" },
          labels: [],
          graph: { kind: "node" },
          hydrated: {
            kind: "post",
            entity: {
              id: "post-1",
              kind: "post",
              body: "hello",
              authorProfileId: "did:key:abc",
              authorSignature: SIG,
            },
          },
        },
      ],
    });
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.hits[0]?.hydrated?.kind).toBe("post");
    if (parsed.hits[0]?.hydrated?.kind === "post") {
      expect(parsed.hits[0].hydrated.entity.body).toBe("hello");
    }
  });

  test("parses hit with hydrated profile neighbor", () => {
    const parsed = zAtriumSearchResponse.parse({
      hits: [
        {
          score: 0.1,
          hydrated: { kind: "ghost", postId: "gone" },
          neighbors: [
            {
              _id: "mem_n",
              labels: [],
              hydrated: {
                kind: "profile",
                entity: { id: "p1", username: "alice" },
              },
            },
          ],
        },
      ],
    });
    expect(parsed.hits[0]?.neighbors?.[0]?.hydrated?.kind).toBe("profile");
  });

  test("parses hit with hydrated subscription", () => {
    const parsed = zAtriumSearchResponse.parse({
      hits: [
        {
          score: 0.2,
          hydrated: {
            kind: "subscription",
            entity: {
              id: "sub-1",
              kind: "subscription",
              title: "Beta intros",
              body: "Looking for partners",
              authorProfileId: "p1",
              authorSignature: SIG,
              search: {
                content: { text: "platform" },
                options: { labels: { some: ["atrium_topic:platform"] } },
              },
            },
          },
        },
      ],
    });
    expect(parsed.hits[0]?.hydrated?.kind).toBe("subscription");
  });
});
