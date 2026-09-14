import type {
  DeliveryReceiptContains,
  DeliveryReceiptSummary,
  DeliveryReceiptTargetsPage,
} from "@khoralabs/khora-contracts";
import { fanOutJobId } from "../persistence/core/fan-out-job-id";
import type { FanOutQueuePort, PrincipalOrdinalPort } from "../persistence/core/port";
import type {
  DeliveryReceiptManifest,
  DeliveryReceiptStore,
  ReceiptFragmentDescriptor,
  ReceiptKind,
} from "./receipt-store";

export class DeliveryReceiptBadRequest extends Error {}

export type DeliveryReceiptReader = {
  summary(postId: string): Promise<DeliveryReceiptSummary | undefined>;
  contains(postId: string, did: string): Promise<DeliveryReceiptContains | undefined>;
  targets(
    postId: string,
    params?: { limit?: number; cursor?: string },
  ): Promise<DeliveryReceiptTargetsPage | undefined>;
};

function validDescriptors(value: unknown): value is ReceiptFragmentDescriptor[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        Number.isInteger((v as ReceiptFragmentDescriptor).high16) &&
        (v as ReceiptFragmentDescriptor).high16 >= 0 &&
        (v as ReceiptFragmentDescriptor).high16 <= 0xffff &&
        typeof (v as ReceiptFragmentDescriptor).key === "string" &&
        Number.isInteger((v as ReceiptFragmentDescriptor).cardinality) &&
        (v as ReceiptFragmentDescriptor).cardinality >= 0 &&
        Number.isInteger((v as ReceiptFragmentDescriptor).byteLength) &&
        (v as ReceiptFragmentDescriptor).byteLength >= 0 &&
        /^[0-9a-f]{64}$/.test((v as ReceiptFragmentDescriptor).sha256),
    )
  );
}

function validManifest(value: DeliveryReceiptManifest | undefined, jobId: string) {
  if (
    value?.version !== 1 ||
    value.jobId !== jobId ||
    !validDescriptors(value.receipts?.target) ||
    !validDescriptors(value.receipts?.delivered) ||
    !validDescriptors(value.receipts?.failed)
  ) {
    return undefined;
  }
  for (const kind of ["target", "delivered", "failed"] as const) {
    const fragments = value.receipts[kind];
    if (fragments.some((v, i) => i > 0 && v.high16 <= (fragments[i - 1]?.high16 ?? -1))) {
      return undefined;
    }
  }
  return value;
}

const count = (manifest: DeliveryReceiptManifest, kind: ReceiptKind) =>
  manifest.receipts[kind].reduce((sum, fragment) => sum + fragment.cardinality, 0);

export function createDeliveryReceiptReader(deps: {
  tenantKey: string;
  queue: FanOutQueuePort;
  ordinals: PrincipalOrdinalPort;
  store: DeliveryReceiptStore;
}): DeliveryReceiptReader {
  const resolve = (postOrJobId: string) => {
    const direct = deps.queue.getJob(postOrJobId);
    if (direct?.tenantKey === deps.tenantKey) return direct;
    const job = deps.queue.getJob(fanOutJobId(deps.tenantKey, postOrJobId));
    return job?.tenantKey === deps.tenantKey && job.postId === postOrJobId ? job : undefined;
  };
  const manifest = async (jobId: string) =>
    validManifest(await deps.store.getManifest(jobId), jobId);
  const queueFailedCount = (jobId: string) => {
    let total = 0;
    for (let index = 0; ; index++) {
      const chunk = deps.queue.getWorkloadChunk(jobId, index);
      if (!chunk) return total;
      total += chunk.failedOrdinals.length;
    }
  };

  async function includes(
    receipt: DeliveryReceiptManifest,
    kind: ReceiptKind,
    ordinal: number,
  ): Promise<boolean | undefined> {
    const fragment = receipt.receipts[kind].find((f) => f.high16 === ordinal >>> 16);
    if (fragment === undefined) return false;
    const values = await deps.store.getFragment(fragment);
    return values?.includes(ordinal & 0xffff);
  }

  return {
    async summary(postId) {
      const job = resolve(postId);
      if (!job) return undefined;
      const receipt = await manifest(job.id);
      return {
        jobId: job.id,
        postId: job.postId,
        status: job.status,
        plannedTargetCount: job.plannedTargetCount,
        routedTargetCount: job.routedTargetCount,
        targetCount: receipt ? count(receipt, "target") : job.plannedTargetCount,
        deliveredCount: receipt ? count(receipt, "delivered") : job.routedTargetCount,
        failedCount: receipt ? count(receipt, "failed") : queueFailedCount(job.id),
        receiptsAvailable: receipt !== undefined,
      };
    },
    async contains(postId, did) {
      const job = resolve(postId);
      if (!job) return undefined;
      const receipt = await manifest(job.id);
      const ordinal = deps.ordinals.getByDid(did);
      if (!receipt || ordinal === undefined) return { available: false };
      const targeted = await includes(receipt, "target", ordinal);
      if (targeted === undefined) return { available: false };
      if (!targeted) return { available: true, targeted: false, status: "not-targeted" };
      const delivered = await includes(receipt, "delivered", ordinal);
      const failed = await includes(receipt, "failed", ordinal);
      if (delivered === undefined || failed === undefined) return { available: false };
      return {
        available: true,
        targeted: true,
        status: delivered ? "delivered" : failed ? "failed" : "pending",
      };
    },
    async targets(postId, params = {}) {
      const job = resolve(postId);
      if (!job) return undefined;
      const limit = params.limit ?? 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw new DeliveryReceiptBadRequest("limit must be an integer between 1 and 200");
      }
      const after = params.cursor === undefined ? -1 : Number.parseInt(params.cursor, 10);
      if (
        !Number.isInteger(after) ||
        after < -1 ||
        after > 0xffff_ffff ||
        (params.cursor !== undefined && String(after) !== params.cursor)
      ) {
        throw new DeliveryReceiptBadRequest("invalid cursor");
      }
      const receipt = await manifest(job.id);
      if (!receipt) return { available: false };
      const page: number[] = [];
      for (const descriptor of receipt.receipts.target) {
        if (descriptor.high16 < after >>> 16 && after >= 0) continue;
        const lows = await deps.store.getFragment(descriptor);
        if (!lows) return { available: false };
        for (const low of lows) {
          const ordinal = descriptor.high16 * 0x1_0000 + low;
          if (ordinal > after) page.push(ordinal);
          if (page.length === limit + 1) break;
        }
        if (page.length === limit + 1) break;
      }
      const hasMore = page.length > limit;
      const shown = page.slice(0, limit);
      const dids = deps.ordinals.resolveMany(shown);
      const items = shown.flatMap((ordinal) => {
        const did = dids.get(ordinal);
        return did === undefined ? [] : [{ ordinal, did }];
      });
      return {
        available: true,
        items,
        hasMore,
        nextCursor: hasMore ? String(shown.at(-1)) : null,
      };
    },
  };
}
