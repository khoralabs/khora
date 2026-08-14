import type {
  AckWriteLogAppliedInput,
  AckWriteLogAppliedOutput,
  AppendOutboxRecordInput,
  AppendOutboxRecordOutput,
  AppendWriteLogEntryInput,
  AppendWriteLogEntryOutput,
  CellId,
  DeleteOutboxRecordInput,
  EnqueueInboxDeliveryInput,
  EnqueueInboxDeliveryOutput,
  FetchOutboxPayloadInput,
  FetchOutboxPayloadOutput,
  FetchWriteLogBatchInput,
  FetchWriteLogBatchOutput,
  InboxEntryId,
  ListOutboxRecordsForPrincipalInput,
  ListPendingInboxEntriesInput,
  ListPendingInboxEntriesOutput,
  OutboxListedRecord,
  PrincipalId,
  TenantKey,
  VerifyAndDrainInboxBatchInput,
  VerifyAndDrainInboxBatchOutput,
} from "./colonnade-types";

export type DiscardInboxEntriesInput = {
  readonly cell_id: CellId;
  readonly tenant_key: TenantKey;
  readonly principal_id: PrincipalId;
  readonly inbox_entry_ids: readonly InboxEntryId[];
};

/**
 * Adapter for a single **cell** (shard) database: **`CellStore`** + **`CellWriteLog`**.
 * A deployment typically has one strategy instance per physical shard file / connection.
 */
export interface CellPersistence {
  appendOutboxRecord(input: AppendOutboxRecordInput): Promise<AppendOutboxRecordOutput>;
  enqueueInboxDelivery(input: EnqueueInboxDeliveryInput): Promise<EnqueueInboxDeliveryOutput>;
  listPendingInboxEntries(
    input: ListPendingInboxEntriesInput,
  ): Promise<ListPendingInboxEntriesOutput>;
  fetchOutboxPayload(input: FetchOutboxPayloadInput): Promise<FetchOutboxPayloadOutput>;
  deleteOutboxRecord(input: DeleteOutboxRecordInput): Promise<void>;
  listOutboxRecordsForPrincipal(
    input: ListOutboxRecordsForPrincipalInput,
  ): Promise<readonly OutboxListedRecord[]>;
  verifyAndDrainInboxBatch(
    input: VerifyAndDrainInboxBatchInput,
  ): Promise<VerifyAndDrainInboxBatchOutput>;

  appendWriteLogEntry(input: AppendWriteLogEntryInput): Promise<AppendWriteLogEntryOutput>;
  fetchWriteLogBatch(input: FetchWriteLogBatchInput): Promise<FetchWriteLogBatchOutput>;
  ackWriteLogApplied(input: AckWriteLogAppliedInput): Promise<AckWriteLogAppliedOutput>;

  /** Drop inbox rows without resolving payloads (stale pointers / undeliverable author). */
  discardInboxEntries(input: DiscardInboxEntriesInput): Promise<void>;

  /** Remove all inbox rows for this recipient and outbox rows for this principal (teardown). */
  purgePrincipal(principalId: PrincipalId): Promise<void>;
}

export type CellBatchCapable = {
  enqueueInboxDeliveriesBatch(
    inputs: readonly EnqueueInboxDeliveryInput[],
  ): Promise<readonly EnqueueInboxDeliveryOutput[]>;
  appendWriteLogEntriesBatch(
    inputs: readonly AppendWriteLogEntryInput[],
  ): Promise<readonly AppendWriteLogEntryOutput[]>;
};

export function supportsCellBatch(cell: unknown): cell is CellBatchCapable {
  return (
    typeof cell === "object" &&
    cell !== null &&
    "enqueueInboxDeliveriesBatch" in cell &&
    "appendWriteLogEntriesBatch" in cell &&
    typeof (cell as CellBatchCapable).enqueueInboxDeliveriesBatch === "function" &&
    typeof (cell as CellBatchCapable).appendWriteLogEntriesBatch === "function"
  );
}

/** Resolve the persistence strategy for a logical cell id. */
export type ResolveCell = (cellId: string) => CellPersistence;
