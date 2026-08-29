import type {
  AckWriteLogAppliedInput,
  AckWriteLogAppliedOutput,
  AppendOutboxRecordInput,
  AppendOutboxRecordOutput,
  AppendWriteLogEntryInput,
  AppendWriteLogEntryOutput,
  DeleteOutboxRecordInput,
  EnqueueInboxDeliveryInput,
  EnqueueInboxDeliveryOutput,
  FetchOutboxPayloadInput,
  FetchOutboxPayloadOutput,
  FetchWriteLogBatchInput,
  FetchWriteLogBatchOutput,
  ListOutboxRecordsForPrincipalInput,
  ListPendingInboxEntriesInput,
  ListPendingInboxEntriesOutput,
  OutboxListedRecord,
  PrincipalId,
  VerifyAndDrainInboxBatchInput,
  VerifyAndDrainInboxBatchOutput,
} from "../../core/colonnade-types";
import { assertContentHash } from "../../core/hash";
import type { CellPersistence, DiscardInboxEntriesInput } from "./cell-persistence";

/** Thin facade over {@link CellPersistence} with light output validation. */
export class CellPersistenceClient implements CellPersistence {
  constructor(private readonly strategy: CellPersistence) {}

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

  deleteOutboxRecord(input: DeleteOutboxRecordInput): Promise<void> {
    return this.strategy.deleteOutboxRecord(input);
  }

  listOutboxRecordsForPrincipal(
    input: ListOutboxRecordsForPrincipalInput,
  ): Promise<readonly OutboxListedRecord[]> {
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
