import type { InboxDelivery } from "@khoralabs/colonnade";
import type { Percolator, PercolatorCandidate } from "@khoralabs/percolator";
import type {
  FanOutJob,
  FanOutQueuePort,
  FanOutWorkloadChunk,
  PrincipalOrdinalPort,
} from "../persistence/core/port";
import type { DeliveryReceiptStore } from "../receipts/receipt-store";
import { MAX_FAN_OUT_WORKLOAD_RECORDS } from "../receipts/workload-codec";
import { selectFanOutDeliveryMode } from "./policy";

export type FanOutWorkerEvent =
  | {
      type: "planning";
      outcome: "success" | "failure";
      jobId: string;
      attempt: number;
      queueLagMs: number;
      queueDepth: number;
      leaseRecovered: boolean;
      durationMs: number;
      policyMode: FanOutJob["fanOutPolicy"]["mode"];
      targets?: number;
      chunks?: number;
      deliveryMode?: "push" | "pull";
      retry?: boolean;
      error?: string;
    }
  | {
      type: "delivery";
      outcome: "success" | "failure";
      jobId: string;
      chunkIndex: number;
      attempt: number;
      queueLagMs: number;
      queueDepth: number;
      leaseRecovered: boolean;
      durationMs: number;
      targets: number;
      delivered?: number;
      failed?: number;
      retry?: boolean;
      error?: string;
    }
  | {
      type: "receipt";
      jobId: string;
      available: boolean;
      durationMs: number;
      fragmentBytes?: number;
      fragmentCount?: number;
      targetCardinality?: number;
      error?: string;
    };

export type FanOutObserver = (event: FanOutWorkerEvent) => void;

export type FanOutPlannerDeps = {
  queue: FanOutQueuePort;
  percolator: Percolator;
  candidateForJob(job: FanOutJob): Promise<PercolatorCandidate> | PercolatorCandidate;
  receipts?: DeliveryReceiptStore;
  chunkSize?: number;
  pageSize?: number;
  leaseMs?: number;
  /** Base delay for the first retry; aliases backoffBaseMs. */
  retryDelayMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  maxAttempts?: number;
  now?: () => number;
  observe?: FanOutObserver;
};

export async function runNextFanOutPlanningJob(deps: FanOutPlannerDeps): Promise<boolean> {
  const now = deps.now?.() ?? Date.now();
  const job = deps.queue.tryClaimPlanning(now, deps.leaseMs ?? 30_000);
  if (job === undefined) return false;
  const started = performance.now();
  let chunks = 0;
  try {
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
          chunks++;
          chunk = [];
        }
      }
      previous = owner.ownerOrdinal;
      pending = { ordinal: owner.ownerOrdinal, subscriptionMatches: owner.matches };
      count++;
    }
    if (pending !== undefined) chunk.push(pending);
    if (chunk.length > 0) {
      deps.queue.appendWorkloadChunk(job.id, chunk, now);
      chunks++;
    }
    const deliveryMode = selectFanOutDeliveryMode(job, count);
    if (count === 0) {
      await writeEmptyReceipts(deps.receipts, job, deps.observe);
    } else if (deliveryMode === "pull") {
      await writeReceipts(
        { queue: deps.queue, receipts: deps.receipts, observe: deps.observe },
        job,
      );
    }
    deps.queue.completePlanning(job.id, count, deps.now?.() ?? Date.now(), deliveryMode);
    observe(deps.observe, {
      ...planningEvent(job, deps.queue, now, started),
      outcome: "success",
      targets: count,
      chunks,
      deliveryMode,
    });
  } catch (error) {
    const terminal = job.attemptCount >= (deps.maxAttempts ?? 5);
    const message = errorMessage(error);
    deps.queue.failPlanning(
      job.id,
      deps.now?.() ?? Date.now(),
      message,
      terminal ? undefined : retryAtMs(now, job.attemptCount, deps),
    );
    observe(deps.observe, {
      ...planningEvent(job, deps.queue, now, started),
      outcome: "failure",
      chunks,
      retry: !terminal,
      error: message,
    });
  }
  return true;
}

async function writeEmptyReceipts(
  receipts: DeliveryReceiptStore | undefined,
  job: FanOutJob,
  observer?: FanOutObserver,
): Promise<void> {
  if (receipts === undefined) return;
  const started = performance.now();
  const result = await receipts.write(
    job.id,
    { target: [], delivered: [], failed: [] },
    job.createdAtMs,
    {
      sorted: true,
    },
  );
  observe(observer, receiptEvent(job.id, started, result));
}

export type FanOutDeliveryDeps = {
  queue: FanOutQueuePort;
  principalOrdinals: PrincipalOrdinalPort;
  inboxDelivery: InboxDelivery;
  cellIdForPrincipal(did: string): string;
  receipts?: DeliveryReceiptStore;
  leaseMs?: number;
  /** Base delay for the first retry; aliases backoffBaseMs. */
  retryDelayMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  maxAttempts?: number;
  now?: () => number;
  observe?: FanOutObserver;
  onDelivered?: (dids: readonly string[]) => void | Promise<void>;
};

export async function runNextFanOutDeliveryChunk(deps: FanOutDeliveryDeps): Promise<boolean> {
  const now = deps.now?.() ?? Date.now();
  const chunk = deps.queue.tryClaimDelivery(now, deps.leaseMs ?? 30_000);
  if (chunk === undefined) return false;
  const job = deps.queue.getJob(chunk.jobId);
  if (job === undefined) return false;
  const started = performance.now();
  try {
    const dids = deps.principalOrdinals.resolveMany(chunk.records.map(({ ordinal }) => ordinal));
    const records = chunk.records.filter(({ ordinal }) => dids.has(ordinal));
    const targets = records.map((record) => {
      const did = dids.get(record.ordinal) as string;
      return {
        recipient_principal_id: did,
        recipient_cell_id: deps.cellIdForPrincipal(did),
        inbox_metadata: {
          postId: job.postId,
          authorPrincipalId: job.authorPrincipalId,
          postKind: job.postKind,
          createdAtMs: job.createdAtMs,
          subscriptionMatches: record.subscriptionMatches,
        },
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
        terminal ? undefined : retryAtMs(now, chunk.attemptCount, deps),
      );
      observe(deps.observe, {
        ...deliveryEvent(chunk, deps.queue, now, started),
        outcome: "failure",
        retry: !terminal,
        error: "retryable fan-out delivery failure",
      });
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
    await notifyDelivered(
      deps.onDelivered,
      delivered.flatMap((ordinal) => {
        const did = dids.get(ordinal);
        return did === undefined ? [] : [did];
      }),
    );
    observe(deps.observe, {
      ...deliveryEvent(chunk, deps.queue, now, started),
      outcome: "success",
      delivered: delivered.length,
      failed: failed.length,
    });
  } catch (error) {
    const terminal = chunk.attemptCount >= (deps.maxAttempts ?? 5);
    const message = errorMessage(error);
    deps.queue.failDelivery(
      chunk.jobId,
      chunk.chunkIndex,
      deps.now?.() ?? Date.now(),
      message,
      terminal ? undefined : retryAtMs(now, chunk.attemptCount, deps),
    );
    observe(deps.observe, {
      ...deliveryEvent(chunk, deps.queue, now, started),
      outcome: "failure",
      retry: !terminal,
      error: message,
    });
  }
  return true;
}

export type FanOutWorkersHandle = { stop(): Promise<void>; reconcile(): Promise<void> };

export function startFanOutWorkers(opts: {
  planner: FanOutPlannerDeps;
  delivery: FanOutDeliveryDeps;
  intervalMs?: number;
  onTick?: () => Promise<void>;
}): FanOutWorkersHandle {
  let stopped = false;
  let running = false;
  const reconcile = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await runNextFanOutPlanningJob(opts.planner);
      await runNextFanOutDeliveryChunk(opts.delivery);
      try {
        await opts.onTick?.();
      } catch {
        /* maintenance ticks fail open */
      }
    } finally {
      running = false;
    }
  };
  const id = setInterval(() => void reconcile(), opts.intervalMs ?? 500);
  void reconcile();
  return {
    stop: async () => {
      stopped = true;
      clearInterval(id);
      while (running) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    reconcile,
  };
}

async function writeReceipts(
  deps: Pick<FanOutDeliveryDeps, "queue" | "receipts" | "observe">,
  job: FanOutJob,
): Promise<void> {
  const receipts = deps.receipts;
  if (receipts === undefined) return;
  const started = performance.now();
  const result = await receipts.write(
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
  observe(deps.observe, receiptEvent(job.id, started, result));
}

function receiptEvent(
  jobId: string,
  started: number,
  result: Awaited<ReturnType<DeliveryReceiptStore["write"]>>,
): FanOutWorkerEvent {
  const fragments = result.available ? Object.values(result.manifest.receipts).flat() : [];
  return {
    type: "receipt",
    jobId,
    available: result.available,
    durationMs: performance.now() - started,
    fragmentBytes: fragments.reduce((sum, fragment) => sum + fragment.byteLength, 0),
    fragmentCount: fragments.length,
    targetCardinality: result.available
      ? result.manifest.receipts.target.reduce((sum, fragment) => sum + fragment.cardinality, 0)
      : 0,
    ...(!result.available && result.error !== undefined ? { error: result.error } : {}),
  };
}

function planningEvent(job: FanOutJob, queue: FanOutQueuePort, now: number, started: number) {
  const stats = queue.stats();
  return {
    type: "planning" as const,
    jobId: job.id,
    attempt: job.attemptCount,
    queueLagMs: Math.max(0, now - job.availableAtMs),
    queueDepth: stats.pendingPlanning + stats.openPlanningLeases,
    leaseRecovered: job.attemptCount > 1 && job.lastError === null,
    durationMs: performance.now() - started,
    policyMode: job.fanOutPolicy.mode,
  };
}

function deliveryEvent(
  chunk: FanOutWorkloadChunk,
  queue: FanOutQueuePort,
  now: number,
  started: number,
) {
  const stats = queue.stats();
  return {
    type: "delivery" as const,
    jobId: chunk.jobId,
    chunkIndex: chunk.chunkIndex,
    attempt: chunk.attemptCount,
    queueLagMs: Math.max(0, now - chunk.availableAtMs),
    queueDepth: stats.pendingDelivery + stats.openDeliveryLeases,
    leaseRecovered: chunk.attemptCount > 1 && chunk.lastError === null,
    durationMs: performance.now() - started,
    targets: chunk.records.length,
  };
}

function observe(observer: FanOutObserver | undefined, event: FanOutWorkerEvent): void {
  try {
    observer?.(event);
  } catch {
    // Observability must never change durable fan-out behavior.
  }
}

async function notifyDelivered(
  callback: FanOutDeliveryDeps["onDelivered"],
  dids: readonly string[],
): Promise<void> {
  if (dids.length === 0) return;
  try {
    await callback?.(dids);
  } catch {
    // Live notification is best-effort; durable inbox delivery already succeeded.
  }
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

function retryAtMs(
  now: number,
  attemptCount: number,
  deps: { backoffBaseMs?: number; backoffMaxMs?: number; retryDelayMs?: number },
): number {
  const base = deps.backoffBaseMs ?? deps.retryDelayMs ?? 1_000;
  if (!Number.isInteger(base) || base < 0) {
    throw new RangeError("backoffBaseMs must be a non-negative integer");
  }
  const max = deps.backoffMaxMs ?? 60_000;
  if (!Number.isInteger(max) || max < 1)
    throw new RangeError("backoffMaxMs must be a positive integer");
  if (base === 0) return now;
  const shift = Math.max(0, attemptCount - 1);
  const delay = shift >= 31 ? max : Math.min(base * 2 ** shift, max);
  return now + delay;
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
