import type { ObjectStorePort } from "./object-store";
import { receiptManifestPath } from "./receipt-store";

export type ReceiptGcDeps = {
  objects: ObjectStorePort;
  isReferenced(jobId: string): boolean;
  nowMs: number;
  retentionMs: number;
  prefixLimit?: number;
  afterPrefix?: string;
};

export type ReceiptGcResult = {
  scanned: number;
  deleted: number;
  skippedActive: number;
  nextAfterPrefix?: string;
};

const RECEIPT_ROOT = "fan-out-receipts/";

export async function runOrphanReceiptGc(deps: ReceiptGcDeps): Promise<ReceiptGcResult> {
  const limit = Math.max(1, deps.prefixLimit ?? 64);
  const prefixes = await deps.objects.listChildPrefixes(RECEIPT_ROOT, {
    limit,
    ...(deps.afterPrefix !== undefined ? { after: deps.afterPrefix } : {}),
  });
  let deleted = 0;
  let skippedActive = 0;
  for (const prefix of prefixes) {
    const jobId = decodeURIComponent(prefix.slice(RECEIPT_ROOT.length));
    const children = await deps.objects.listPrefix(`${prefix}/`);
    const newest = await newestMtimeMs(deps.objects, children);
    if (newest === undefined || newest > deps.nowMs - deps.retentionMs) {
      skippedActive++;
      continue;
    }
    const hasManifest = children.includes(receiptManifestPath(jobId));
    if (hasManifest && deps.isReferenced(jobId)) continue;
    await deps.objects.deletePrefix(`${prefix}/`);
    deleted++;
  }
  return {
    scanned: prefixes.length,
    deleted,
    skippedActive,
    ...(prefixes.length === limit ? { nextAfterPrefix: prefixes.at(-1) } : {}),
  };
}

async function newestMtimeMs(
  objects: ObjectStorePort,
  keys: string[],
): Promise<number | undefined> {
  let newest: number | undefined;
  for (const key of keys) {
    const meta = await objects.head(key);
    const mtime = meta?.mtimeMs;
    if (mtime === undefined) return undefined;
    newest = newest === undefined ? mtime : Math.max(newest, mtime);
  }
  return newest;
}
