import type { CellPersistence } from "../persistence/core/cell-persistence";
import { supportsCellBatch } from "../persistence/core/cell-persistence";
import type {
  EnqueueInboxDeliveryInput,
  EnqueueInboxDeliveryOutput,
  FanOutTarget,
  GeneratedInboxRef,
  InboxStagingPayload,
} from "./colonnade-types";
import { randomId } from "./hash";
import type { InboxDelivery, InboxDeliveryInput, InboxDeliveryResult } from "./inbox-delivery";
import type { CellRoute, CellRouteResolver } from "./placement";

export type CellNodeBatch = {
  readonly partitionId: string;
  readonly epoch: number;
  readonly deliveries: readonly EnqueueInboxDeliveryInput[];
};

export interface CellNodeClient {
  enqueueMany(
    route: CellRoute,
    batch: CellNodeBatch,
  ): Promise<readonly EnqueueInboxDeliveryOutput[]>;
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

  async enqueueMany(batch: CellNodeBatch): Promise<readonly EnqueueInboxDeliveryOutput[]> {
    if (batch.partitionId !== this.partitionId) {
      throw new Error(`Unknown partition ${batch.partitionId}`);
    }
    if (batch.epoch !== this.epoch) {
      throw new StaleCellRouteEpochError(batch.epoch, this.epoch);
    }

    const outputs = new Array<EnqueueInboxDeliveryOutput>(batch.deliveries.length);
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
        const results =
          supportsCellBatch(home) && group.length > 1
            ? await home.enqueueInboxDeliveriesBatch(group.map((entry) => entry.input))
            : await Promise.all(group.map((entry) => home.enqueueInboxDelivery(entry.input)));
        group.forEach((entry, index) => {
          const output = results[index];
          if (output !== undefined) outputs[entry.index] = output;
        });
      }),
    );
    return outputs;
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
    const groups = new Map<string, { route: CellRoute; targets: FanOutTarget[] }>();
    const failures: NonNullable<InboxDeliveryResult["failures"]>[number][] = [];
    for (const target of input.targets) {
      const route = routes.get(target.recipient_cell_id);
      if (route === undefined) {
        failures.push({ ...targetFailure(target, new Error("No cell route")), retryable: true });
        continue;
      }
      const key = `${route.nodeId}\0${route.partitionId}\0${route.epoch}`;
      const group = groups.get(key) ?? { route, targets: [] };
      group.targets.push(target);
      groups.set(key, group);
    }

    const jobs: Array<() => Promise<GeneratedInboxRef[]>> = [];
    for (const { route, targets } of groups.values()) {
      for (let offset = 0; offset < targets.length; offset += this.maxBatchSize) {
        const chunk = targets.slice(offset, offset + this.maxBatchSize);
        jobs.push(async () => {
          const deliveries = chunk.map((target) => deliveryFor(input, target));
          try {
            const outputs = await this.opts.client.enqueueMany(route, {
              partitionId: route.partitionId,
              epoch: route.epoch,
              deliveries,
            });
            if (outputs.length !== chunk.length) throw new Error("Cell node result count mismatch");
            return chunk.map((target, index) => ({
              inbox_entry_id: outputs[index]?.inbox_entry_id ?? "",
              recipient_cell_id: target.recipient_cell_id,
              recipient_principal_id: target.recipient_principal_id,
            }));
          } catch (error) {
            const retryable = error instanceof StaleCellRouteEpochError;
            failures.push(
              ...chunk.map((target) => ({ ...targetFailure(target, error), retryable })),
            );
            return [];
          }
        });
      }
    }
    const refs = (await runBounded(jobs, this.concurrency)).flat();
    return {
      generated_inbox_refs: refs,
      ...(failures.length > 0 ? { failures } : {}),
    };
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
  return {
    cell_id: target.recipient_cell_id,
    tenant_key: input.tenant_key,
    recipient_principal_id: target.recipient_principal_id,
    staging,
    correlation_id: randomId("fan"),
  };
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
