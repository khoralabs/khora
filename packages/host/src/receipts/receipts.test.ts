import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createDeliveryReceiptStore,
  createLocalFilesystemObjectStore,
  fragmentReceiptOrdinals,
  NoopDeliveryReceiptStore,
  type ObjectStorePort,
  ReceiptBitmapCodec,
  receiptManifestPath,
  restoreReceiptOrdinals,
} from ".";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("receipt object storage", () => {
  test("no-op reports receipts unavailable", async () => {
    expect(
      await new NoopDeliveryReceiptStore().write("job", {
        target: [],
        delivered: [],
        failed: [],
      }),
    ).toEqual({ available: false });
  });

  test("filesystem objects are immutable", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "khora-receipts-"));
    temporaryDirectories.push(directory);
    const store = createLocalFilesystemObjectStore(directory);
    await store.putImmutable("a/b", new Uint8Array([1, 2]));
    expect(await store.get("a/b")).toEqual(new Uint8Array([1, 2]));
    expect(await store.head("a/b")).toEqual({ byteLength: 2 });
    expect(await store.listPrefix("a/")).toEqual(["a/b"]);
    await expect(store.putImmutable("a/b", new Uint8Array([3]))).rejects.toThrow(/already exists/);
  });

  test("portable bitmap fragments round-trip unsigned ordinals", () => {
    const ordinals = [1, 2, 65_536, 0xffff_ffff, 2];
    const fragments = fragmentReceiptOrdinals(ordinals).map((fragment) => ({
      ...fragment,
      ordinals: ReceiptBitmapCodec.decode(ReceiptBitmapCodec.encode(fragment.ordinals)),
    }));
    expect(restoreReceiptOrdinals(fragments)).toEqual([1, 2, 65_536, 0xffff_ffff]);
  });

  test("manifest is written after described fragments", async () => {
    const writes: { key: string; bytes: Uint8Array }[] = [];
    const objects: ObjectStorePort = {
      async putImmutable(key, bytes) {
        writes.push({ key, bytes });
      },
      async get(key) {
        return writes.find((entry) => entry.key === key)?.bytes;
      },
      async head() {
        return undefined;
      },
      async listPrefix() {
        return [];
      },
      async deletePrefix() {},
    };
    const store = createDeliveryReceiptStore(objects);
    const result = await store.write(
      "job/1",
      { target: [1, 65_537], delivered: [1], failed: [] },
      123,
    );
    expect(result.available).toBe(true);
    expect(writes.at(-1)?.key).toBe(receiptManifestPath("job/1"));
    if (!result.available) throw new Error("expected available receipts");
    expect(result.manifest.receipts.target.map(({ cardinality }) => cardinality)).toEqual([1, 1]);
    expect(result.manifest.receipts.target.every(({ sha256 }) => sha256.length === 64)).toBe(true);
    expect(await store.getManifest("job/1")).toEqual(result.manifest);
  });

  test("write failures fail open and report unavailable", async () => {
    const store = createDeliveryReceiptStore({
      async putImmutable() {
        throw new Error("offline");
      },
      async get() {
        return undefined;
      },
      async head() {
        return undefined;
      },
      async listPrefix() {
        return [];
      },
      async deletePrefix() {},
    });
    expect(await store.write("job", { target: [1], delivered: [], failed: [] })).toEqual({
      available: false,
      error: "offline",
    });
  });
});
