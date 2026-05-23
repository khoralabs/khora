import type {
  CellPersistenceStrategy,
  DiscardInboxEntriesInput,
} from "../cell-persistence-strategy.ts";
import type {
  AckWriteLogAppliedInput,
  AckWriteLogAppliedOutput,
  AppendOutboxRecordInput,
  AppendOutboxRecordOutput,
  AppendWriteLogEntryInput,
  AppendWriteLogEntryOutput,
  EnqueueInboxDeliveryInput,
  EnqueueInboxDeliveryOutput,
  FetchOutboxPayloadInput,
  FetchOutboxPayloadOutput,
  FetchWriteLogBatchInput,
  FetchWriteLogBatchOutput,
  ListPendingInboxEntriesInput,
  ListPendingInboxEntriesOutput,
  VerifyAndDrainInboxBatchInput,
  VerifyAndDrainInboxBatchOutput,
} from "../colonnade-types.ts";
import type { SqliteCellBatchCapable } from "./sqlite-cell-strategy.ts";

type RpcReq = {
  readonly kind: "rpc";
  readonly id: number;
  readonly method: string;
  readonly args: readonly unknown[];
};
type RpcOk = { readonly kind: "rpc_ok"; readonly id: number; readonly result: unknown };
type RpcErr = { readonly kind: "rpc_err"; readonly id: number; readonly error: string };

function spawnCellWorker(
  cellId: string,
  dbPath: string,
  init: { sqlCipherKey: string; outboxKeyHex: string },
): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./sqlite-cell-worker.ts", import.meta.url));
    const onMsg = (ev: MessageEvent<{ readonly kind?: string }>) => {
      const d = ev.data;
      if (d.kind === "ready") {
        worker.removeEventListener("message", onMsg as EventListener);
        resolve(worker);
      }
    };
    worker.addEventListener("message", onMsg as EventListener);
    worker.addEventListener("error", (e) => reject(e));
    worker.postMessage({ kind: "init", cellId, dbPath, ...init });
  });
}

/** Bun **`Worker`** RPC façade over **`SqliteCellPersistenceStrategy`** (one connection per worker). */
export class WorkerBackedCellStrategy implements CellPersistenceStrategy, SqliteCellBatchCapable {
  private rpcSeq = 0;
  private readonly pending = new Map<
    number,
    { readonly resolve: (v: unknown) => void; readonly reject: (e: unknown) => void }
  >();

  private constructor(private readonly worker: Worker) {
    this.worker.addEventListener("message", ((ev: MessageEvent<RpcOk | RpcErr>) => {
      const d = ev.data;
      if (d.kind !== "rpc_ok" && d.kind !== "rpc_err") {
        return;
      }
      const id = d.id;
      const slot = this.pending.get(id);
      this.pending.delete(id);
      if (slot === undefined) {
        return;
      }
      if (d.kind === "rpc_err") {
        slot.reject(new Error(d.error));
      } else {
        slot.resolve(d.result);
      }
    }) as EventListener);
  }

  static async create(
    cellId: string,
    dbPath: string,
    init: { sqlCipherKey: string; outboxKeyHex: string },
  ): Promise<WorkerBackedCellStrategy> {
    const worker = await spawnCellWorker(cellId, dbPath, init);
    return new WorkerBackedCellStrategy(worker);
  }

  terminate(): void {
    this.worker.terminate();
  }

  private call<T>(method: string, args: readonly unknown[]): Promise<T> {
    const id = ++this.rpcSeq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      const req: RpcReq = { kind: "rpc", id, method, args };
      this.worker.postMessage(req);
    });
  }

  appendOutboxRecord(input: AppendOutboxRecordInput): Promise<AppendOutboxRecordOutput> {
    return this.call("appendOutboxRecord", [input]);
  }

  enqueueInboxDelivery(input: EnqueueInboxDeliveryInput): Promise<EnqueueInboxDeliveryOutput> {
    return this.call("enqueueInboxDelivery", [input]);
  }

  enqueueInboxDeliveriesBatch(
    inputs: readonly EnqueueInboxDeliveryInput[],
  ): Promise<readonly EnqueueInboxDeliveryOutput[]> {
    return this.call("enqueueInboxDeliveriesBatch", [inputs]);
  }

  listPendingInboxEntries(
    input: ListPendingInboxEntriesInput,
  ): Promise<ListPendingInboxEntriesOutput> {
    return this.call("listPendingInboxEntries", [input]);
  }

  fetchOutboxPayload(input: FetchOutboxPayloadInput): Promise<FetchOutboxPayloadOutput> {
    return this.call("fetchOutboxPayload", [input]);
  }

  deleteOutboxRecord(
    input: import("../colonnade-types.ts").DeleteOutboxRecordInput,
  ): Promise<void> {
    return this.call("deleteOutboxRecord", [input]);
  }

  listOutboxRecordsForPrincipal(
    input: import("../colonnade-types.ts").ListOutboxRecordsForPrincipalInput,
  ): Promise<readonly import("../colonnade-types.ts").OutboxListedRecord[]> {
    return this.call("listOutboxRecordsForPrincipal", [input]);
  }

  verifyAndDrainInboxBatch(
    input: VerifyAndDrainInboxBatchInput,
  ): Promise<VerifyAndDrainInboxBatchOutput> {
    return this.call("verifyAndDrainInboxBatch", [input]);
  }

  appendWriteLogEntry(input: AppendWriteLogEntryInput): Promise<AppendWriteLogEntryOutput> {
    return this.call("appendWriteLogEntry", [input]);
  }

  appendWriteLogEntriesBatch(
    inputs: readonly AppendWriteLogEntryInput[],
  ): Promise<readonly AppendWriteLogEntryOutput[]> {
    return this.call("appendWriteLogEntriesBatch", [inputs]);
  }

  fetchWriteLogBatch(input: FetchWriteLogBatchInput): Promise<FetchWriteLogBatchOutput> {
    return this.call("fetchWriteLogBatch", [input]);
  }

  ackWriteLogApplied(input: AckWriteLogAppliedInput): Promise<AckWriteLogAppliedOutput> {
    return this.call("ackWriteLogApplied", [input]);
  }

  purgePrincipal(principalId: string): Promise<void> {
    return this.call("purgePrincipal", [principalId]);
  }

  discardInboxEntries(input: DiscardInboxEntriesInput): Promise<void> {
    return this.call("discardInboxEntries", [input]);
  }
}

/** Lazy-init worker façade so **`ResolveCellStrategy`** stays synchronous. */
export class LazyWorkerBackedCellStrategy
  implements CellPersistenceStrategy, SqliteCellBatchCapable
{
  private inner?: WorkerBackedCellStrategy;
  private readonly boot: Promise<WorkerBackedCellStrategy>;

  constructor(
    cellId: string,
    dbPath: string,
    init: { sqlCipherKey: string; outboxKeyHex: string },
  ) {
    this.boot = WorkerBackedCellStrategy.create(cellId, dbPath, init).then((s) => {
      this.inner = s;
      return s;
    });
  }

  terminate(): void {
    this.inner?.terminate();
  }

  private async s(): Promise<WorkerBackedCellStrategy> {
    return this.inner ?? this.boot;
  }

  async appendOutboxRecord(input: AppendOutboxRecordInput): Promise<AppendOutboxRecordOutput> {
    return this.s().then((x) => x.appendOutboxRecord(input));
  }

  async enqueueInboxDelivery(
    input: EnqueueInboxDeliveryInput,
  ): Promise<EnqueueInboxDeliveryOutput> {
    return this.s().then((x) => x.enqueueInboxDelivery(input));
  }

  async enqueueInboxDeliveriesBatch(
    inputs: readonly EnqueueInboxDeliveryInput[],
  ): Promise<readonly EnqueueInboxDeliveryOutput[]> {
    return this.s().then((x) => x.enqueueInboxDeliveriesBatch(inputs));
  }

  async listPendingInboxEntries(
    input: ListPendingInboxEntriesInput,
  ): Promise<ListPendingInboxEntriesOutput> {
    return this.s().then((x) => x.listPendingInboxEntries(input));
  }

  async fetchOutboxPayload(input: FetchOutboxPayloadInput): Promise<FetchOutboxPayloadOutput> {
    return this.s().then((x) => x.fetchOutboxPayload(input));
  }

  async deleteOutboxRecord(
    input: import("../colonnade-types.ts").DeleteOutboxRecordInput,
  ): Promise<void> {
    return this.s().then((x) => x.deleteOutboxRecord(input));
  }

  async listOutboxRecordsForPrincipal(
    input: import("../colonnade-types.ts").ListOutboxRecordsForPrincipalInput,
  ): Promise<readonly import("../colonnade-types.ts").OutboxListedRecord[]> {
    return this.s().then((x) => x.listOutboxRecordsForPrincipal(input));
  }

  async verifyAndDrainInboxBatch(
    input: VerifyAndDrainInboxBatchInput,
  ): Promise<VerifyAndDrainInboxBatchOutput> {
    return this.s().then((x) => x.verifyAndDrainInboxBatch(input));
  }

  async appendWriteLogEntry(input: AppendWriteLogEntryInput): Promise<AppendWriteLogEntryOutput> {
    return this.s().then((x) => x.appendWriteLogEntry(input));
  }

  async appendWriteLogEntriesBatch(
    inputs: readonly AppendWriteLogEntryInput[],
  ): Promise<readonly AppendWriteLogEntryOutput[]> {
    return this.s().then((x) => x.appendWriteLogEntriesBatch(inputs));
  }

  async fetchWriteLogBatch(input: FetchWriteLogBatchInput): Promise<FetchWriteLogBatchOutput> {
    return this.s().then((x) => x.fetchWriteLogBatch(input));
  }

  async ackWriteLogApplied(input: AckWriteLogAppliedInput): Promise<AckWriteLogAppliedOutput> {
    return this.s().then((x) => x.ackWriteLogApplied(input));
  }

  async purgePrincipal(principalId: string): Promise<void> {
    return this.s().then((x) => x.purgePrincipal(principalId));
  }

  async discardInboxEntries(input: DiscardInboxEntriesInput): Promise<void> {
    return this.s().then((x) => x.discardInboxEntries(input));
  }
}
