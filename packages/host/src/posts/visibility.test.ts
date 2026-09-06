import { describe, expect, test } from "bun:test";
import type { KhoraPost, PrincipalId } from "@khoralabs/khora-contracts";
import { encodePostId } from "../lib/post-address-id";
import { createInMemoryKhoraHostPersistence } from "../persistence/core/in-memory";
import { canReadPost, connectedPeerPrincipalIds } from "./visibility";

describe("connectedPeerPrincipalIds", () => {
  test("ignores pending invites; includes only bound peers", () => {
    const p = createInMemoryKhoraHostPersistence();
    const author = "did:test:author" as PrincipalId;
    const peer = "did:test:peer" as PrincipalId;
    p.social.createRelationship({
      channelId: "pending",
      creatorPrincipalId: author,
      intendedPeerPrincipalId: peer,
    });
    expect([...connectedPeerPrincipalIds(p.social, author)]).toEqual([]);
    expect([...connectedPeerPrincipalIds(p.social, peer)]).toEqual([]);

    p.social.bindPeer({ channelId: "pending", peerPrincipalId: peer });
    expect(connectedPeerPrincipalIds(p.social, author).has(peer)).toBe(true);
    expect(connectedPeerPrincipalIds(p.social, peer).has(author)).toBe(true);
  });

  test("network visibility requires accepted relationship", () => {
    const p = createInMemoryKhoraHostPersistence();
    const author = "did:test:author" as PrincipalId;
    const peer = "did:test:peer" as PrincipalId;
    p.social.createRelationship({
      channelId: "ch",
      creatorPrincipalId: author,
      intendedPeerPrincipalId: peer,
    });
    const networkPost = {
      id: encodePostId({ authorPrincipalId: author, recordKey: "rk", cellPoolCount: 1 }),
      visibility: "network",
    } as KhoraPost;

    expect(canReadPost({ post: networkPost, readerPrincipalId: peer, social: p.social })).toBe(
      false,
    );
    p.social.bindPeer({ channelId: "ch", peerPrincipalId: peer });
    expect(canReadPost({ post: networkPost, readerPrincipalId: peer, social: p.social })).toBe(
      true,
    );
  });
});
