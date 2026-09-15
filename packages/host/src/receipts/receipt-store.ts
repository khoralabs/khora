import { createHash } from "node:crypto";
import {
  fragmentReceiptOrdinals,
  fragmentSortedReceiptOrdinals,
  ReceiptBitmapCodec,
} from "./bitmap";
import type { ObjectStorePort } from "./object-store";

export type ReceiptKind = "target" | "delivered" | "failed";
export type ReceiptFragmentDescriptor = {
  high16: number;
  key: string;
  cardinality: number;
  byteLength: number;
  sha256: string;
};
export type DeliveryReceiptManifest = {
  version: 1;
  jobId: string;
  createdAtMs: number;
  receipts: Record<ReceiptKind, ReceiptFragmentDescriptor[]>;
};
export type ReceiptWriteResult =
  | { available: true; manifest: DeliveryReceiptManifest }
  | { available: false; error?: string };

export interface DeliveryReceiptStore {
  write(
    jobId: string,
    receipts: Record<ReceiptKind, Iterable<number>>,
    nowMs?: number,
    opts?: { sorted?: boolean },
  ): Promise<ReceiptWriteResult>;
  getManifest(jobId: string): Promise<DeliveryReceiptManifest | undefined>;
  digestManifest(jobId: string): Promise<string | undefined>;
  getManifestRecord(
    jobId: string,
  ): Promise<{ manifest: DeliveryReceiptManifest; digest: string } | undefined>;
  getFragment(descriptor: ReceiptFragmentDescriptor): Promise<number[] | undefined>;
}

const segment = (value: string) => encodeURIComponent(value);
export const receiptPrefix = (jobId: string) => `fan-out-receipts/${segment(jobId)}`;
export const receiptManifestPath = (jobId: string) => `${receiptPrefix(jobId)}/manifest.json`;
export const receiptFragmentPath = (jobId: string, kind: ReceiptKind, high16: number) =>
  `${receiptPrefix(jobId)}/${kind}/${high16.toString(16).padStart(4, "0")}.roaring`;

export class NoopDeliveryReceiptStore implements DeliveryReceiptStore {
  async write(
    _jobId: string,
    _receipts: Record<ReceiptKind, Iterable<number>>,
    _nowMs?: number,
    _opts?: { sorted?: boolean },
  ): Promise<ReceiptWriteResult> {
    return { available: false };
  }
  async getManifest(_jobId: string): Promise<undefined> {
    return undefined;
  }
  async digestManifest(_jobId: string): Promise<undefined> {
    return undefined;
  }
  async getManifestRecord(_jobId: string): Promise<undefined> {
    return undefined;
  }
  async getFragment(_descriptor: ReceiptFragmentDescriptor): Promise<undefined> {
    return undefined;
  }
}

async function putIdempotent(
  objects: ObjectStorePort,
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  const existing = await objects.get(key);
  if (existing !== undefined) {
    if (
      existing.byteLength === bytes.byteLength &&
      existing.every((byte, i) => byte === bytes[i])
    ) {
      return;
    }
    throw new Error(`object already exists with different content: ${key}`);
  }
  try {
    await objects.putImmutable(key, bytes);
  } catch (error) {
    const raced = await objects.get(key);
    if (
      raced !== undefined &&
      raced.byteLength === bytes.byteLength &&
      raced.every((byte, i) => byte === bytes[i])
    ) {
      return;
    }
    throw error;
  }
}

export type ReceiptFragmentCacheOptions = {
  maxEntries?: number;
  maxDecodedBytes?: number;
};

function createFragmentLru(opts: ReceiptFragmentCacheOptions = {}) {
  const maxEntries = Math.max(0, opts.maxEntries ?? 256);
  const maxDecodedBytes = Math.max(0, opts.maxDecodedBytes ?? 8_388_608);
  const entries = new Map<string, { values: number[]; decodedBytes: number }>();
  let decodedBytes = 0;
  const evict = () => {
    while (entries.size > maxEntries || decodedBytes > maxDecodedBytes) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      const removed = entries.get(oldest);
      entries.delete(oldest);
      decodedBytes -= removed?.decodedBytes ?? 0;
    }
  };
  return {
    get(key: string) {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry.values;
    },
    set(key: string, values: number[]) {
      if (maxEntries === 0 || maxDecodedBytes === 0) return;
      const size = values.length * 4;
      const prior = entries.get(key);
      if (prior !== undefined) {
        entries.delete(key);
        decodedBytes -= prior.decodedBytes;
      }
      entries.set(key, { values, decodedBytes: size });
      decodedBytes += size;
      evict();
    },
  };
}

/** Writes immutable fragments first and the manifest last. Errors are reported, never thrown. */
export function createDeliveryReceiptStore(
  objects?: ObjectStorePort,
  cache: ReceiptFragmentCacheOptions = {},
): DeliveryReceiptStore {
  if (!objects) return new NoopDeliveryReceiptStore();
  const fragments = createFragmentLru(cache);
  return {
    async write(jobId, receipts, nowMs = Date.now(), opts = {}) {
      try {
        const manifest: DeliveryReceiptManifest = {
          version: 1,
          jobId,
          createdAtMs: nowMs,
          receipts: { target: [], delivered: [], failed: [] },
        };
        for (const kind of ["target", "delivered", "failed"] as const) {
          const parts = opts.sorted
            ? fragmentSortedReceiptOrdinals(receipts[kind])
            : fragmentReceiptOrdinals(receipts[kind]);
          for (const fragment of parts) {
            const bytes = ReceiptBitmapCodec.encode(fragment.ordinals);
            const descriptor: ReceiptFragmentDescriptor = {
              high16: fragment.high16,
              key: receiptFragmentPath(jobId, kind, fragment.high16),
              cardinality: fragment.ordinals.length,
              byteLength: bytes.byteLength,
              sha256: createHash("sha256").update(bytes).digest("hex"),
            };
            await putIdempotent(objects, descriptor.key, bytes);
            manifest.receipts[kind].push(descriptor);
          }
        }
        await putIdempotent(
          objects,
          receiptManifestPath(jobId),
          new TextEncoder().encode(JSON.stringify(manifest)),
        );
        return { available: true, manifest };
      } catch (error) {
        return { available: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    async getManifestRecord(jobId) {
      try {
        const bytes = await objects.get(receiptManifestPath(jobId));
        if (!bytes) return undefined;
        return {
          manifest: JSON.parse(new TextDecoder().decode(bytes)) as DeliveryReceiptManifest,
          digest: createHash("sha256").update(bytes).digest("hex"),
        };
      } catch {
        return undefined;
      }
    },
    async getManifest(jobId) {
      return (await this.getManifestRecord(jobId))?.manifest;
    },
    async digestManifest(jobId) {
      return (await this.getManifestRecord(jobId))?.digest;
    },
    async getFragment(descriptor) {
      const cacheKey = `${descriptor.key}:${descriptor.sha256}`;
      const cached = fragments.get(cacheKey);
      if (cached !== undefined) return cached;
      try {
        const bytes = await objects.get(descriptor.key);
        if (
          bytes === undefined ||
          bytes.byteLength !== descriptor.byteLength ||
          createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256
        ) {
          return undefined;
        }
        const values = ReceiptBitmapCodec.decode(bytes);
        fragments.set(cacheKey, values);
        return values;
      } catch {
        return undefined;
      }
    },
  };
}
