import { describe, expect, test } from "bun:test";
import { zKhoraRelationshipListResponse } from "./khora-relationships";

describe("khora-relationships", () => {
  test("zKhoraRelationshipListResponse", () => {
    const r = zKhoraRelationshipListResponse.parse({
      relationships: [
        {
          roomId: "r1",
          role: "creator",
          creatorDid: "did:key:a",
          peerDid: null,
          createdAtMs: 1,
          expiresAtMs: 2,
        },
      ],
    });
    expect(r.relationships).toHaveLength(1);
    expect(r.relationships[0]?.role).toBe("creator");
  });
});
