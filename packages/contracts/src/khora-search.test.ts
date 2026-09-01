import { describe, expect, test } from "bun:test";
import { zKhoraSearchRequest, zKhoraSearchResponse } from "./khora-search";

const SIG = "dGVzdC1zaWduYXR1cmU";
// A valid atp0-encoded post id with authorPrincipalId "did:key:abc"
const POST_ID = `atp0:${Buffer.from(JSON.stringify({ p: "did:key:abc", r: "ob_1234", n: 16 }), "utf8").toString("base64url")}`;

describe("zKhoraSearchResponse", () => {
  test("parses hit with original post and authorDid", () => {
    const parsed = zKhoraSearchResponse.parse({
      hits: [
        {
          _id: "sm_1",
          score: 0.42,
          sourceKey: "body",
          memory: { _id: "mem_1", namespace: "global", key: "k", kind: "node" },
          labels: [],
          graph: { kind: "node" },
          original: {
            kind: "post",
            post: {
              id: POST_ID,
              kind: "post",
              body: "hello",
              authorProfileId: "p1",
              authorSignature: SIG,
            },
            authorDid: "did:key:abc",
          },
        },
      ],
    });
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.hits[0]?.original?.kind).toBe("post");
    if (parsed.hits[0]?.original?.kind === "post") {
      expect(parsed.hits[0].original.post.body).toBe("hello");
      expect(parsed.hits[0].original.authorDid).toBe("did:key:abc");
    }
  });

  test("parses hit with ghost original and profile neighbor", () => {
    const parsed = zKhoraSearchResponse.parse({
      hits: [
        {
          score: 0.1,
          original: { kind: "ghost", postId: "gone" },
          neighbors: [
            {
              _id: "mem_n",
              labels: [],
              original: {
                kind: "profile",
                entity: { id: "p1", username: "alice" },
              },
            },
          ],
        },
      ],
    });
    expect(parsed.hits[0]?.neighbors?.[0]?.original?.kind).toBe("profile");
  });

  test("parses hit with subscription original", () => {
    const parsed = zKhoraSearchResponse.parse({
      hits: [
        {
          score: 0.2,
          original: {
            kind: "subscription",
            post: {
              id: POST_ID,
              kind: "subscription",
              body: "Looking for partners",
              authorProfileId: "p1",
              authorSignature: SIG,
              search: {
                content: { text: "platform" },
                options: { labels: { some: ["khora_topic:platform"] } },
              },
            },
            authorDid: "did:key:abc",
          },
        },
      ],
    });
    expect(parsed.hits[0]?.original?.kind).toBe("subscription");
  });
});

describe("zKhoraSearchRequest asOf", () => {
  test("accepts asOf.lte", () => {
    const parsed = zKhoraSearchRequest.parse({
      content: { text: "hello" },
      asOf: { lte: 1_700_000_000_000 },
    });
    expect(parsed.asOf).toEqual({ lte: 1_700_000_000_000 });
  });

  test("strips unknown asOfTimestampMs", () => {
    const parsed = zKhoraSearchRequest.parse({
      content: { text: "hello" },
      asOfTimestampMs: 1_700_000_000_000,
    });
    expect(parsed.asOf).toBeUndefined();
    expect("asOfTimestampMs" in parsed).toBe(false);
  });
});
