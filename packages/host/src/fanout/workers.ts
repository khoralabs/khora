import type { InboxDelivery } from "@khoralabs/colonnade";
import type { Percolator, PercolatorCandidate } from "@khoralabs/percolator";
import type {
  FanOutJob,
  FanOutQueuePort,
  FanOutWorkloadChunk,
  PrincipalOrdinalPort,
} from "../persistence/core/port";
import type { DeliveryReceiptStore } from "../receipts/receipt-store";
import { NoopDeliveryReceiptStore } from "../receipts/receipt-store";
import { MAX_FAN_OUT_WORKLOAD_RECORDS } from "../receipts/workload-codec";

export type FanOutPlannerDeps = {
  queue: FanOutQueuePort;
  percolator: Percolator;
  candidateForJob(job: FanOutJob): Promise<PercolatorCandidate> | PercolatorCandidate;
  receipts?: DeliveryReceiptStore;
  chunkSize?: number;
  pageSize?: number;
  leaseMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
  now?: () => number;
};

export async function runNextFanOutPlanningJob(deps: FanOutPlannerDeps): Promise<boolean> {
  const now = deps.now?.() ?? Date.now();
  const job = deps.queue.tryClaimPlanning(now, deps.leaseMs ?? 30_000);
  if (job === undefined) return false;
  try {
    if (job.fanOutPolicy === "catalog-pull") {
      deps.queue.completePlanning(job.id, 0, deps.now?.() ?? Date.now());
      await writeEmptyReceipts(deps.receipts, job);
      return true;
    }
    const chunkSize = boundedChunkSize(deps.chunkSize);
    const candidate = await deps.candidateForJob(job);
    let chunk: Array<{ ordinal: number; subscriptionMatches: readonly unknown[] }> = [];
    let pending: { ordinal: number; subscriptionMatches: readonly unknown[] } | undefined;
    let count = 0;
    let previous = -1;
    for await (const owner of deps.percolator.evaluateCandidateStream(candidate, {
      pageSize: deps.pageSize,
      now,
    })) {
      if (
        !Number.isInteger(owner.ownerOrdinal) ||
        owner.ownerOrdinal < 0 ||
        owner.ownerOrdinal > 0xffff_ffff
      ) {
        throw new Error("percolator returned invalid principal ordinal");
      }
      if (owner.ownerOrdinal < previous) throw new Error("percolator stream is not ordinal sorted");
      if (owner.ownerOrdinal === previous) {
        if (pending !== undefined) {
          pending.subscriptionMatches = [...pending.subscriptionMatches, ...owner.matches];
        }
        continue;
      }
      if (pending !== undefined) {
        chunk.push(pending);
        if (chunk.length === chunkSize) {
          deps.queue.appendWorkloadChunk(job.id, chunk, now);
          chunk = [];
        }
      }
      previous = owner.ownerOrdinal;
      pending = { ordinal: owner.ownerOrdinal, subscriptionMatches: owner.matches };
      count++;
    }
    if (pending !== undefined) chunk.push(pending);
    if (chunk.length > 0) deps.queue.appendWorkloadChunk(job.id, chunk, now);
    deps.queue.completePlanning(job.id, count, deps.now?.() ?? Date.now());
    if (count === 0 && deps.receipts !== undefined) {
      await writeEmptyReceipts(deps.receipts, job);
    }
  } catch (error) {
    const terminal = job.attemptCount >= (deps.maxAttempts ?? 5);
    deps.queue.failPlanning(
      job.id,
      deps.now?.() ?? Date.now(),
      errorMessage(error),
      terminal ? undefined : now + (deps.retryDelayMs ?? 1_000),
    );
  }
  return true;
}

async function writeEmptyReceipts(
  receipts: DeliveryReceiptStore | undefined,
  job: FanOutJob,
): Promise<void> {
  if (receipts === undefined) return;
  await receipts.write(job.id, { target: [], delivered: [], failed: [] }, job.createdAtMs, {
    sorted: true,
  });
}

export type FanOutDeliveryDeps = {
  queue: FanOutQueuePort;
  principalOrdinals: PrincipalOrdinalPort;
  inboxDelivery: InboxDelivery;
  cellIdForPrincipal(did: string): string;
  receipts?: DeliveryReceiptStore;
  leaseMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
  now?: () => number;
};

export async function runNextFanOutDeliveryChunk(deps: FanOutDeliveryDeps): Promise<boolean> {
  const now = deps.now?.() ?? Date.now();
  const chunk = deps.queue.tryClaimDelivery(now, deps.leaseMs ?? 30_000);
  if (chunk === undefined) return false;
  const job = deps.queue.getJob(chunk.jobId);
  if (job === undefined) return false;
  try {
    const dids = deps.principalOrdinals.resolveMany(chunk.records.map(({ ordinal }) => ordinal));
    const records = chunk.records.filter(({ ordinal }) => dids.has(ordinal));
    const targets = records.map((record) => {
      const did = dids.get(record.ordinal) as string;
      return {
        recipient_principal_id: did,
        recipient_cell_id: deps.cellIdForPrincipal(did),
        inbox_metadata: { subscriptionMatches: record.subscriptionMatches },
      };
    });
    const result = await deps.inboxDelivery.deliver({
      tenant_key: job.tenantKey,
      pointer: {
        source_cell_id: job.sourceCellId,
        source_record_key: job.sourceRecordKey,
        content_hash: job.sourceContentHash,
        cell_pool_count: job.cellPoolCount,
      },
      targets,
    });
    const delivered = records
      .filter((_, index) => hasBit(result.success_bitmap, index))
      .map(({ ordinal }) => ordinal);
    const retryable = new Set(
      (result.failures ?? [])
        .filter((failure) => failure.retryable)
        .map((failure) => failure.recipient_principal_id),
    );
    if (retryable.size > 0) {
      const terminal = chunk.attemptCount >= (deps.maxAttempts ?? 5);
      deps.queue.failDelivery(
        chunk.jobId,
        chunk.chunkIndex,
        deps.now?.() ?? Date.now(),
        "retryable fan-out delivery failure",
        terminal ? undefined : now + (deps.retryDelayMs ?? 1_000),
      );
      return true;
    }
    const failed = records
      .filter((_, index) => !hasBit(result.success_bitmap, index))
      .map(({ ordinal }) => ordinal);
    failed.push(
      ...chunk.records.filter(({ ordinal }) => !dids.has(ordinal)).map(({ ordinal }) => ordinal),
    );
    failed.sort((a, b) => a - b);
    deps.queue.completeDelivery(
      chunk.jobId,
      chunk.chunkIndex,
      delivered,
      failed,
      deps.now?.() ?? Date.now(),
    );
    const completed = deps.queue.getJob(chunk.jobId);
    if (completed?.status === "completed") {
      await writeReceipts(deps, completed);
    }
  } catch (error) {
    const terminal = chunk.attemptCount >= (deps.maxAttempts ?? 5);
    deps.queue.failDelivery(
      chunk.jobId,
      chunk.chunkIndex,
      deps.now?.() ?? Date.now(),
      errorMessage(error),
      terminal ? undefined : now + (deps.retryDelayMs ?? 1_000),
    );
  }
  return true;
}

export type FanOutWorkersHandle = { stop(): void; reconcile(): Promise<void> };

export function startFanOutWorkers(opts: {
  planner: FanOutPlannerDeps;
  delivery: FanOutDeliveryDeps;
  intervalMs?: number;
}): FanOutWorkersHandle {
  let stopped = false;
  let running = false;
  const reconcile = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await runNextFanOutPlanningJob(opts.planner);
      await runNextFanOutDeliveryChunk(opts.delivery);
    } finally {
      running = false;
    }
  };
  const id = setInterval(() => void reconcile(), opts.intervalMs ?? 500);
  void reconcile();
  return {
    stop: () => {
      stopped = true;
      clearInterval(id);
    },
    reconcile,
  };
}

async function writeReceipts(deps: FanOutDeliveryDeps, job: FanOutJob): Promise<void> {
  const receipts = deps.receipts ?? new NoopDeliveryReceiptStore();
  await receipts.write(
    job.id,
    {
      target: receiptOrdinals(deps.queue, job.id, (chunk) =>
        chunk.records.map(({ ordinal }) => ordinal),
      ),
      delivered: receiptOrdinals(deps.queue, job.id, (chunk) => chunk.deliveredOrdinals),
      failed: receiptOrdinals(deps.queue, job.id, (chunk) => chunk.failedOrdinals),
    },
    job.createdAtMs,
    { sorted: true },
  );
}

function* receiptOrdinals(
  queue: FanOutQueuePort,
  jobId: string,
  select: (chunk: FanOutWorkloadChunk) => readonly number[],
): IterableIterator<number> {
  for (let chunkIndex = 0; ; chunkIndex++) {
    const chunk = queue.getWorkloadChunk(jobId, chunkIndex);
    if (chunk === undefined) return;
    yield* select(chunk);
  }
}

function boundedChunkSize(value = MAX_FAN_OUT_WORKLOAD_RECORDS): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_FAN_OUT_WORKLOAD_RECORDS) {
    throw new RangeError(`chunkSize must be 1-${MAX_FAN_OUT_WORKLOAD_RECORDS}`);
  }
  return value;
}

function hasBit(bitmap: Uint8Array, index: number): boolean {
  return ((bitmap[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
