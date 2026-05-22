import { describe, expect, test } from "bun:test";
import { zAtriumSearchResponse } from "./atrium-search.ts";

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
});
