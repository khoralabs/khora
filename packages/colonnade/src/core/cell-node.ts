import type { CellPersistence } from "../persistence/core/cell-persistence";
import { supportsCellBatch } from "../persistence/core/cell-persistence";
import type {
  EnqueueInboxDeliveryInput,
  FanOutTarget,
  InboxStagingPayload,
} from "./colonnade-types";
import { deterministicInboxDeliveryId } from "./hash";
import type { InboxDelivery, InboxDeliveryInput, InboxDeliveryResult } from "./inbox-delivery";
import type { CellRoute, CellRouteResolver } from "./placement";

export type CellNodeBatch = {
  readonly partitionId: string;
  readonly epoch: number;
  readonly deliveries: readonly EnqueueInboxDeliveryInput[];
};

export type CellNodeBatchFailure = {
  readonly index: number;
  readonly error: string;
  readonly retryable: boolean;
};

export type CellNodeBatchResult = {
  readonly delivered_count: number;
  readonly success_bitmap: Uint8Array;
  readonly failures?: readonly CellNodeBatchFailure[];
};

export interface CellNodeClient {
  enqueueMany(route: CellRoute, batch: CellNodeBatch): Promise<CellNodeBatchResult>;
}

export class StaleCellRouteEpochError extends Error {
  readonly retryable = true;

  constructor(
    readonly expectedEpoch: number,
    readonly actualEpoch: number,
  ) {
    super(`Stale cell route epoch: expected ${expectedEpoch}, current ${actualEpoch}`);
    this.name = "StaleCellRouteEpochError";
  }
}

export type GroupedPartitionPersistenceOptions = {
  readonly partitionId: string;
  readonly epoch: number;
  readonly openHome: (logicalCellId: string, principalId: string) => CellPersistence;
  readonly maxOpenHomes?: number;
};

/** A partition-local facade that keeps many principal homes behind one node route. */
export class GroupedPartitionPersistence {
  readonly partitionId: string;
  private epoch: number;
  private readonly homes = new Map<string, CellPersistence>();
  private readonly maxOpenHomes: number;

  constructor(private readonly opts: GroupedPartitionPersistenceOptions) {
    this.partitionId = opts.partitionId;
    this.epoch = opts.epoch;
    this.maxOpenHomes = positiveInteger(opts.maxOpenHomes ?? 1_024, "maxOpenHomes");
  }

  setEpoch(epoch: number): void {
    this.epoch = epoch;
  }

  async enqueueMany(batch: CellNodeBatch): Promise<CellNodeBatchResult> {
    if (batch.partitionId !== this.partitionId) {
      throw new Error(`Unknown partition ${batch.partitionId}`);
    }
    if (batch.epoch !== this.epoch) {
      throw new StaleCellRouteEpochError(batch.epoch, this.epoch);
    }

    const success_bitmap = new Uint8Array(Math.ceil(batch.deliveries.length / 8));
    const failures: CellNodeBatchFailure[] = [];
    const groups = new Map<
      CellPersistence,
      Array<{ index: number; input: EnqueueInboxDeliveryInput }>
    >();
    for (let index = 0; index < batch.deliveries.length; index++) {
      const input = batch.deliveries[index];
      if (input === undefined) continue;
      let home = this.homes.get(input.cell_id);
      if (home === undefined) {
        if (this.homes.size >= this.maxOpenHomes) {
          const oldest = this.homes.keys().next().value;
          if (oldest !== undefined) this.homes.delete(oldest);
        }
        home = this.opts.openHome(input.cell_id, input.recipient_principal_id);
      } else {
        this.homes.delete(input.cell_id);
      }
      this.homes.set(input.cell_id, home);
      const group = groups.get(home) ?? [];
      group.push({ index, input });
      groups.set(home, group);
    }

    await Promise.all(
      [...groups.entries()].map(async ([home, group]) => {
        try {
          if (supportsCellBatch(home) && group.length > 1) {
            await home.enqueueInboxDeliveriesBatch(group.map((entry) => entry.input));
          } else {
            await Promise.all(group.map((entry) => home.enqueueInboxDelivery(entry.input)));
          }
          for (const entry of group) setBit(success_bitmap, entry.index);
        } catch (error) {
          for (const entry of group) {
            failures.push({
              index: entry.index,
              error: error instanceof Error ? error.message : String(error),
              retryable: false,
            });
          }
        }
      }),
    );
    return {
      delivered_count: batch.deliveries.length - failures.length,
      success_bitmap,
      ...(failures.length > 0 ? { failures } : {}),
    };
  }
}

export class InProcessCellNodeClient implements CellNodeClient {
  constructor(
    private readonly partitions:
      | ReadonlyMap<string, GroupedPartitionPersistence>
      | ((partitionId: string) => GroupedPartitionPersistence | undefined),
  ) {}

  enqueueMany(_route: CellRoute, batch: CellNodeBatch) {
    const partition =
      typeof this.partitions === "function"
        ? this.partitions(batch.partitionId)
        : this.partitions.get(batch.partitionId);
    if (partition === undefined) throw new Error(`Unknown partition ${batch.partitionId}`);
    return partition.enqueueMany(batch);
  }
}

export type RoutedInboxDeliveryOptions = {
  readonly placement: CellRouteResolver;
  readonly client: CellNodeClient;
  readonly concurrency?: number;
  readonly maxBatchSize?: number;
  readonly maxTargets?: number;
  readonly observeBatch?: (event: {
    batchIndex: number;
    targets: number;
    active: number;
    durationMs: number;
    outcome: "success" | "failure";
  }) => void;
};

export class RoutedInboxDelivery implements InboxDelivery {
  private readonly concurrency: number;
  private readonly maxBatchSize: number;
  private readonly maxTargets: number;

  constructor(private readonly opts: RoutedInboxDeliveryOptions) {
    this.concurrency = positiveInteger(opts.concurrency ?? 8, "concurrency");
    this.maxBatchSize = Math.min(512, positiveInteger(opts.maxBatchSize ?? 512, "maxBatchSize"));
    this.maxTargets = positiveInteger(opts.maxTargets ?? 10_000, "maxTargets");
  }

  async deliver(input: InboxDeliveryInput): Promise<InboxDeliveryResult> {
    if (input.targets.length > this.maxTargets) {
      throw new RangeError(`RoutedInboxDelivery target limit exceeded (${this.maxTargets})`);
    }
    const routes = await this.opts.placement.resolveMany([
      ...new Set(input.targets.map((target) => target.recipient_cell_id)),
    ]);
    const groups = new Map<
      string,
      { route: CellRoute; targets: Array<{ index: number; target: FanOutTarget }> }
    >();
    const failures: NonNullable<InboxDeliveryResult["failures"]>[number][] = [];
    const success_bitmap = new Uint8Array(Math.ceil(input.targets.length / 8));
    for (let index = 0; index < input.targets.length; index++) {
      const target = input.targets[index];
      if (target === undefined) continue;
      const route = routes.get(target.recipient_cell_id);
      if (route === undefined) {
        failures.push({ ...targetFailure(target, new Error("No cell route")), retryable: true });
        continue;
      }
      const key = `${route.nodeId}\0${route.partitionId}\0${route.epoch}`;
      const group = groups.get(key) ?? { route, targets: [] };
      group.targets.push({ index, target });
      groups.set(key, group);
    }

    const jobs: Array<() => Promise<void>> = [];
    let active = 0;
    for (const { route, targets } of groups.values()) {
      for (let offset = 0; offset < targets.length; offset += this.maxBatchSize) {
        const chunk = targets.slice(offset, offset + this.maxBatchSize);
        const batchIndex = jobs.length;
        jobs.push(async () => {
          const started = performance.now();
          active++;
          let outcome: "success" | "failure" = "success";
          const deliveries = chunk.map(({ target }) => deliveryFor(input, target));
          try {
            const result = await this.opts.client.enqueueMany(route, {
              partitionId: route.partitionId,
              epoch: route.epoch,
              deliveries,
            });
            if (result.success_bitmap.length !== Math.ceil(chunk.length / 8)) {
              throw new Error("Cell node result bitmap size mismatch");
            }
            for (let index = 0; index < chunk.length; index++) {
              const entry = chunk[index];
              if (entry !== undefined && hasBit(result.success_bitmap, index)) {
                setBit(success_bitmap, entry.index);
              }
            }
            for (const failure of result.failures ?? []) {
              const target = chunk[failure.index]?.target;
              if (target !== undefined) {
                failures.push({
                  ...targetFailure(target, new Error(failure.error)),
                  retryable: failure.retryable,
                });
              }
            }
          } catch (error) {
            outcome = "failure";
            const retryable = error instanceof StaleCellRouteEpochError;
            failures.push(
              ...chunk.map(({ target }) => ({ ...targetFailure(target, error), retryable })),
            );
          } finally {
            observeBatch(this.opts.observeBatch, {
              batchIndex,
              targets: chunk.length,
              active,
              durationMs: performance.now() - started,
              outcome,
            });
            active--;
          }
        });
      }
    }
    await runBounded(jobs, this.concurrency);
    return {
      target_count: input.targets.length,
      delivered_count: countBits(success_bitmap),
      success_bitmap,
      ...(failures.length > 0 ? { failures } : {}),
    };
  }
}

function observeBatch(
  observer: RoutedInboxDeliveryOptions["observeBatch"],
  event: Parameters<NonNullable<RoutedInboxDeliveryOptions["observeBatch"]>>[0],
): void {
  try {
    observer?.(event);
  } catch {
    // Observability must never change delivery behavior.
  }
}

function deliveryFor(input: InboxDeliveryInput, target: FanOutTarget): EnqueueInboxDeliveryInput {
  const staging: InboxStagingPayload = {
    kind: "pointer",
    pointer: {
      pointer: input.pointer,
      ...(target.inbox_metadata !== undefined ? { metadata: target.inbox_metadata } : {}),
    },
  };
  const delivery_id = deterministicInboxDeliveryId({
    tenant_key: input.tenant_key,
    pointer: input.pointer,
    target,
  });
  return {
    cell_id: target.recipient_cell_id,
    tenant_key: input.tenant_key,
    recipient_principal_id: target.recipient_principal_id,
    staging,
    delivery_id,
    correlation_id: delivery_id,
  };
}

function setBit(bitmap: Uint8Array, index: number): void {
  const byte = index >> 3;
  bitmap[byte] = (bitmap[byte] ?? 0) | (1 << (index & 7));
}

function hasBit(bitmap: Uint8Array, index: number): boolean {
  return ((bitmap[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
}

function countBits(bitmap: Uint8Array): number {
  let count = 0;
  for (const byte of bitmap) {
    let value = byte;
    while (value > 0) {
      value &= value - 1;
      count++;
    }
  }
  return count;
}

function targetFailure(target: FanOutTarget, error: unknown) {
  return {
    recipient_cell_id: target.recipient_cell_id,
    recipient_principal_id: target.recipient_principal_id,
    error,
  };
}

async function runBounded<T>(jobs: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const outputs = new Array<T>(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, jobs.length) }, async () => {
      while (next < jobs.length) {
        const index = next++;
        const job = jobs[index];
        if (job !== undefined) outputs[index] = await job();
      }
    }),
  );
  return outputs;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1)
    throw new RangeError(`${name} must be a positive integer`);
  return value;
}
