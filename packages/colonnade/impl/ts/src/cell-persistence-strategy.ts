import type {
  AckWriteLogAppliedInput,
  AckWriteLogAppliedOutput,
  AppendOutboxRecordInput,
  AppendOutboxRecordOutput,
  AppendWriteLogEntryInput,
  AppendWriteLogEntryOutput,
  CellId,
  EnqueueInboxDeliveryInput,
  EnqueueInboxDeliveryOutput,
  FetchOutboxPayloadInput,
  FetchOutboxPayloadOutput,
  FetchWriteLogBatchInput,
  FetchWriteLogBatchOutput,
  InboxEntryId,
  ListPendingInboxEntriesInput,
  ListPendingInboxEntriesOutput,
  PrincipalId,
  TenantKey,
  VerifyAndDrainInboxBatchInput,
  VerifyAndDrainInboxBatchOutput,
} from "./colonnade-types.ts";

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
export interface CellPersistenceStrategy {
  appendOutboxRecord(input: AppendOutboxRecordInput): Promise<AppendOutboxRecordOutput>;
  enqueueInboxDelivery(input: EnqueueInboxDeliveryInput): Promise<EnqueueInboxDeliveryOutput>;
  listPendingInboxEntries(
    input: ListPendingInboxEntriesInput,
  ): Promise<ListPendingInboxEntriesOutput>;
  fetchOutboxPayload(input: FetchOutboxPayloadInput): Promise<FetchOutboxPayloadOutput>;
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

/** Resolve the persistence strategy for a logical cell id. */
export type ResolveCellStrategy = (cellId: string) => CellPersistenceStrategy;
