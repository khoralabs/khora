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

/** Writes immutable fragments first and the manifest last. Errors are reported, never thrown. */
export function createDeliveryReceiptStore(objects?: ObjectStorePort): DeliveryReceiptStore {
  if (!objects) return new NoopDeliveryReceiptStore();
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
          const fragments = opts.sorted
            ? fragmentSortedReceiptOrdinals(receipts[kind])
            : fragmentReceiptOrdinals(receipts[kind]);
          for (const fragment of fragments) {
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
    async getManifest(jobId) {
      try {
        const bytes = await objects.get(receiptManifestPath(jobId));
        return bytes
          ? (JSON.parse(new TextDecoder().decode(bytes)) as DeliveryReceiptManifest)
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
}
