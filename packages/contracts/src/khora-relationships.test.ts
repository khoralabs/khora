import { describe, expect, test } from "bun:test";
import {
  zKhoraConnectionRequestPayload,
  zKhoraRelationship,
  zKhoraRelationshipCreate,
  zKhoraRelationshipListResponse,
} from "./khora-relationships";

describe("khora-relationships", () => {
  test("create body requires peerDid", () => {
    expect(zKhoraRelationshipCreate.parse({ peerDid: "did:key:peer" })).toEqual({
      peerDid: "did:key:peer",
    });
    expect(() => zKhoraRelationshipCreate.parse({ peerDid: "  " })).toThrow();
  });

  test("list response and connection_request payload", () => {
    const relationship = zKhoraRelationship.parse({
      channelId: "ch1",
      peerDid: "did:key:peer",
      role: "creator",
      status: "pending",
      createdAtMs: 1,
    });
    expect(zKhoraRelationshipListResponse.parse({ relationships: [relationship] })).toEqual({
      relationships: [relationship],
    });
    expect(
      zKhoraConnectionRequestPayload.parse({
        channelId: "ch1",
        fromPrincipalId: "did:key:from",
        createdAtMs: 1,
      }),
    ).toEqual({
      channelId: "ch1",
      fromPrincipalId: "did:key:from",
      createdAtMs: 1,
    });
  });
});
