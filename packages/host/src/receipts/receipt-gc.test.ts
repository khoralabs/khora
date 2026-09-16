import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalFilesystemObjectStore } from "./object-store";
import { runOrphanReceiptGc } from "./receipt-gc";
import { createDeliveryReceiptStore, receiptFragmentPath, receiptPrefix } from "./receipt-store";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test("orphan GC deletes unreferenced and incomplete prefixes after retention", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "khora-receipt-gc-"));
  temporaryDirectories.push(directory);
  const objects = createLocalFilesystemObjectStore(directory);
  const store = createDeliveryReceiptStore(objects);
  await store.write("keep", { target: [1], delivered: [1], failed: [] }, 1);
  await store.write("orphan", { target: [2], delivered: [], failed: [] }, 1);
  await objects.putImmutable(
    receiptFragmentPath("partial", "target", 0),
    new Uint8Array([1, 2, 3]),
  );
  const now = 10_000;
  for (const key of await objects.listPrefix("fan-out-receipts/")) {
    const file = path.join(directory, key);
    await utimes(file, now / 1000, 1);
  }
  const result = await runOrphanReceiptGc({
    objects,
    isReferenced: (jobId) => jobId === "keep",
    nowMs: now,
    retentionMs: 1000,
  });
  expect(result.deleted).toBe(2);
  expect(await objects.listPrefix(`${receiptPrefix("keep")}/`)).not.toEqual([]);
  expect(await objects.listPrefix(`${receiptPrefix("orphan")}/`)).toEqual([]);
  expect(await objects.listPrefix(`${receiptPrefix("partial")}/`)).toEqual([]);
});

test("orphan GC does not delete active writes inside retention", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "khora-receipt-gc-"));
  temporaryDirectories.push(directory);
  const objects = createLocalFilesystemObjectStore(directory);
  await objects.putImmutable(receiptFragmentPath("partial", "target", 0), new Uint8Array([1]));
  const result = await runOrphanReceiptGc({
    objects,
    isReferenced: () => false,
    nowMs: Date.now(),
    retentionMs: 60_000,
  });
  expect(result.deleted).toBe(0);
  expect(result.skippedActive).toBe(1);
  expect(await objects.listPrefix(`${receiptPrefix("partial")}/`)).not.toEqual([]);
});

test("orphan GC pages child prefixes without listing the receipt root", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "khora-receipt-gc-"));
  temporaryDirectories.push(directory);
  const inner = createLocalFilesystemObjectStore(directory);
  const store = createDeliveryReceiptStore(inner);
  await store.write("a", { target: [1], delivered: [], failed: [] }, 1);
  await store.write("b", { target: [2], delivered: [], failed: [] }, 1);
  const now = 10_000;
  for (const key of await inner.listPrefix("fan-out-receipts/")) {
    await utimes(path.join(directory, key), now / 1000, 1);
  }
  let rootLists = 0;
  const objects = {
    ...inner,
    listPrefix: async (prefix: string) => {
      if (prefix === "fan-out-receipts/" || prefix === "fan-out-receipts") rootLists++;
      return inner.listPrefix(prefix);
    },
  };
  const first = await runOrphanReceiptGc({
    objects,
    isReferenced: () => false,
    nowMs: now,
    retentionMs: 1000,
    prefixLimit: 1,
  });
  expect(first.scanned).toBe(1);
  expect(first.nextAfterPrefix).toBeDefined();
  const second = await runOrphanReceiptGc({
    objects,
    isReferenced: () => false,
    nowMs: now,
    retentionMs: 1000,
    prefixLimit: 1,
    ...(first.nextAfterPrefix !== undefined ? { afterPrefix: first.nextAfterPrefix } : {}),
  });
  expect(second.scanned).toBe(1);
  expect(rootLists).toBe(0);
  expect(await inner.listPrefix("fan-out-receipts/")).toEqual([]);
});
