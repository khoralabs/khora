import { describe, expect, test } from "bun:test";
import { createInMemoryKhoraHostPersistence } from "../persistence/core/in-memory";
import { encodeReceiptListCursor } from "./receipt-cursor";
import { createDeliveryReceiptReader, DeliveryReceiptBadRequest } from "./receipt-reader";
import { createDeliveryReceiptStore, NoopDeliveryReceiptStore } from "./receipt-store";

const input = {
  tenantKey: "tenant",
  postId: "post",
  sourceCellId: "cell",
  sourceRecordKey: "record",
  sourceContentHash: "hash",
  cellPoolCount: 1,
  authorPrincipalId: "did:author",
  postKind: "post",
  postMetadata: {},
  visibility: "public",
  fanOutPolicy: "push" as const,
};

function objectStore() {
  const objects = new Map<string, Uint8Array>();
  return {
    get: async (key: string) => objects.get(key),
    putImmutable: async (key: string, bytes: Uint8Array) => void objects.set(key, bytes),
    head: async (key: string) => {
      const bytes = objects.get(key);
      return bytes ? { byteLength: bytes.byteLength } : undefined;
    },
    listPrefix: async (prefix: string) => [...objects.keys()].filter((k) => k.startsWith(prefix)),
    listChildPrefixes: async () => [],
    deletePrefix: async () => {},
  };
}

describe("delivery receipt reader", () => {
  test("reads membership and deterministic target pages", async () => {
    const persistence = createInMemoryKhoraHostPersistence();
    const alice = persistence.principalOrdinals.getOrCreate("did:alice");
    const bob = persistence.principalOrdinals.getOrCreate("did:bob");
    const id = persistence.fanOutQueue.enqueuePlanning(input, 0);
    const store = createDeliveryReceiptStore(objectStore());
    await store.write(id, {
      target: [alice, bob],
      delivered: [alice],
      failed: [bob],
    });
    const reader = createDeliveryReceiptReader({
      tenantKey: "tenant",
      queue: persistence.fanOutQueue,
      ordinals: persistence.principalOrdinals,
      store,
    });

    expect(await reader.contains("post", "did:alice")).toEqual({
      available: true,
      targeted: true,
      status: "delivered",
    });
    expect(await reader.summary(id)).toMatchObject({ jobId: id, postId: "post" });
    const first = await reader.targets("post", { limit: 1 });
    expect(first).toMatchObject({ available: true, hasMore: true });
    if (!first?.available) throw new Error("expected targets");
    expect(first.nextCursor).not.toBe(String(alice));
    expect(
      await reader.targets("post", { limit: 1, cursor: first.nextCursor ?? undefined }),
    ).toMatchObject({
      available: true,
      items: [{ ordinal: bob, did: "did:bob" }],
      hasMore: false,
    });
    await expect(reader.targets("post", { cursor: "7" })).rejects.toThrow(
      DeliveryReceiptBadRequest,
    );
    await expect(
      reader.targets("post", {
        cursor: encodeReceiptListCursor({
          manifestDigest: "a".repeat(64),
          fragmentIndex: 0,
          lastOrdinal: alice,
        }),
      }),
    ).rejects.toThrow(/stale receipt cursor/);
  });

  test("keeps queue summary but reports object-backed reads unavailable", async () => {
    const persistence = createInMemoryKhoraHostPersistence();
    persistence.fanOutQueue.enqueuePlanning(input, 0);
    const reader = createDeliveryReceiptReader({
      tenantKey: "tenant",
      queue: persistence.fanOutQueue,
      ordinals: persistence.principalOrdinals,
      store: new NoopDeliveryReceiptStore(),
    });
    expect(await reader.summary("post")).toMatchObject({
      status: "planning_pending",
      receiptsAvailable: false,
    });
    expect(await reader.targets("post")).toEqual({ available: false });
    expect(await reader.contains("post", "did:alice")).toEqual({ available: false });
  });
});
