import type {
  CellPersistenceStrategy,
  DiscardInboxEntriesInput,
} from "./cell-persistence-strategy.ts";
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
  PrincipalId,
  VerifyAndDrainInboxBatchInput,
  VerifyAndDrainInboxBatchOutput,
} from "./colonnade-types.ts";
import { assertContentHash } from "./hash.ts";

/** Thin facade over {@link CellPersistenceStrategy} with light output validation. */
export class CellPersistenceClient implements CellPersistenceStrategy {
  constructor(private readonly strategy: CellPersistenceStrategy) {}

  async appendOutboxRecord(input: AppendOutboxRecordInput): Promise<AppendOutboxRecordOutput> {
    const out = await this.strategy.appendOutboxRecord(input);
    assertContentHash(out.content_hash);
    return out;
  }

  enqueueInboxDelivery(input: EnqueueInboxDeliveryInput): Promise<EnqueueInboxDeliveryOutput> {
    return this.strategy.enqueueInboxDelivery(input);
  }

  listPendingInboxEntries(
    input: ListPendingInboxEntriesInput,
  ): Promise<ListPendingInboxEntriesOutput> {
    return this.strategy.listPendingInboxEntries(input);
  }

  async fetchOutboxPayload(input: FetchOutboxPayloadInput): Promise<FetchOutboxPayloadOutput> {
    const out = await this.strategy.fetchOutboxPayload(input);
    if (out.bytes_available) {
      assertContentHash(out.content_hash);
    }
    return out;
  }

  deleteOutboxRecord(input: import("./colonnade-types.ts").DeleteOutboxRecordInput): Promise<void> {
    return this.strategy.deleteOutboxRecord(input);
  }

  listOutboxRecordsForPrincipal(
    input: import("./colonnade-types.ts").ListOutboxRecordsForPrincipalInput,
  ): Promise<readonly import("./colonnade-types.ts").OutboxListedRecord[]> {
    return this.strategy.listOutboxRecordsForPrincipal(input);
  }

  verifyAndDrainInboxBatch(
    input: VerifyAndDrainInboxBatchInput,
  ): Promise<VerifyAndDrainInboxBatchOutput> {
    return this.strategy.verifyAndDrainInboxBatch(input);
  }

  appendWriteLogEntry(input: AppendWriteLogEntryInput): Promise<AppendWriteLogEntryOutput> {
    return this.strategy.appendWriteLogEntry(input);
  }

  fetchWriteLogBatch(input: FetchWriteLogBatchInput): Promise<FetchWriteLogBatchOutput> {
    return this.strategy.fetchWriteLogBatch(input);
  }

  ackWriteLogApplied(input: AckWriteLogAppliedInput): Promise<AckWriteLogAppliedOutput> {
    return this.strategy.ackWriteLogApplied(input);
  }

  purgePrincipal(principalId: PrincipalId): Promise<void> {
    return this.strategy.purgePrincipal(principalId);
  }

  discardInboxEntries(input: DiscardInboxEntriesInput): Promise<void> {
    return this.strategy.discardInboxEntries(input);
  }
}
