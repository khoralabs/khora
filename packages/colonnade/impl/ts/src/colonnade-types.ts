/**
 * Input/output shapes aligned with `packages/colonnade/spec/model/*.smithy`.
 * Smithy `Document` → `unknown`; `Blob` → `Uint8Array`.
 */

import type { ContentAddressedRef, ContentHash, SourceRef } from "@khoralabs/sourcemaps";

export type { ContentHash };

/** `cfd.colonnade` opaque JSON document. */
export type JsonDocument = unknown;

export type CellId = string;
export type TenantKey = string;
export type PrincipalId = string;
export type DrainCursor = string;
export type WriteCorrelationId = string;
export type InboxEntryId = string;
export type OutboxRecordKey = string;
export type CatalogPointerId = string;
export type SourceMapId = string;

export type PrincipalRef = {
  readonly principal_id: PrincipalId;
};

export type CellRef = {
  readonly cell_id: CellId;
  /** Empty string when omitted in adapters that derive tenant elsewhere. */
  readonly tenant_key: TenantKey;
};

export type OutboxLocators = {
  readonly cell_id: CellId;
  readonly record_key: OutboxRecordKey;
  readonly cell_pool_count: number;
};

export type OutboxLocator = OutboxLocators;

export type PointerLocators = {
  readonly source_cell_id: CellId;
  readonly source_record_key: OutboxRecordKey;
  readonly cell_pool_count: number;
};

export type PointerRef = ContentAddressedRef<PointerLocators>;

export type OutboxContentRef = ContentAddressedRef<OutboxLocators>;

export type SourceMapEntryLocators = {
  readonly tenant_key: TenantKey;
  readonly source_map_id: SourceMapId;
  readonly entry_key: string;
};

export type SourceMapEntryRef = SourceRef<SourceMapEntryLocators>;

export type InlinePayload = {
  readonly bytes: Uint8Array;
  readonly content_hash: ContentHash;
};

export type PointerPayload = {
  readonly pointer: PointerRef;
  /** Opaque JSON carried through list/drain (e.g. postId, authorPrincipalId). */
  readonly metadata?: JsonDocument;
};

export type InboxStagingPayload =
  | { readonly kind: "inline"; readonly inline: InlinePayload }
  | { readonly kind: "pointer"; readonly pointer: PointerPayload };

export type FanOutTarget = {
  readonly recipient_cell_id: CellId;
  readonly recipient_principal_id: PrincipalId;
  /** Written into pointer staging `metadata` for this recipient's inbox row. */
  readonly inbox_metadata?: JsonDocument;
};

export type SourceMapPointerHit = {
  readonly entry_key: string;
  readonly pointer: PointerRef;
  readonly source_row_content_hash: ContentHash;
  readonly projection: JsonDocument;
};

// --- Routing / WriteOp ---

export type AppendOutboxWrite = {
  readonly principal_id: PrincipalId;
  readonly record_key: OutboxRecordKey;
  readonly payload_bytes: Uint8Array;
  readonly metadata: JsonDocument;
};

export type EnqueueInboxWrite = {
  readonly target_cell_id: CellId;
  readonly recipient_principal_id: PrincipalId;
  readonly staging: InboxStagingPayload;
  readonly correlation_id: WriteCorrelationId;
};

export type WriteOp =
  | { readonly kind: "append_outbox"; readonly append_outbox: AppendOutboxWrite }
  | { readonly kind: "enqueue_inbox"; readonly enqueue_inbox: EnqueueInboxWrite };

export type RoutedWrite = {
  readonly target_cell_id: CellId;
  readonly correlation_id: WriteCorrelationId;
  readonly op: WriteOp;
};

export type SubmitRoutedWritesInput = {
  readonly writes: readonly RoutedWrite[];
};

export type SubmitRoutedWritesOutput = {
  readonly accepted_correlation_ids: readonly WriteCorrelationId[];
};

export type AppendWriteLogEntryInput = {
  readonly cell_id: CellId;
  readonly correlation_id: WriteCorrelationId;
  readonly op: WriteOp;
};

export type AppendWriteLogEntryOutput = {
  readonly log_sequence: string;
};

export type FetchWriteLogBatchInput = {
  readonly cell_id: CellId;
  readonly after_sequence: string;
  readonly limit: number;
};

export type WriteLogRecord = {
  readonly log_sequence: string;
  readonly correlation_id: WriteCorrelationId;
  readonly op: WriteOp;
};

export type FetchWriteLogBatchOutput = {
  readonly records: readonly WriteLogRecord[];
  readonly next_cursor: string;
};

export type AckWriteLogAppliedInput = {
  readonly cell_id: CellId;
  readonly applied_through_sequence: string;
};

export type AckWriteLogAppliedOutput = Record<string, never>;

// --- CellStore ---

export type AppendOutboxRecordInput = {
  readonly cell_id: CellId;
  readonly tenant_key: TenantKey;
  readonly principal_id: PrincipalId;
  readonly record_key: OutboxRecordKey;
  readonly payload_bytes: Uint8Array;
  readonly metadata: JsonDocument;
};

export type AppendOutboxRecordOutput = {
  readonly record_key: OutboxRecordKey;
  readonly content_hash: ContentHash;
  readonly committed_at_ms: number;
};

export type EnqueueInboxDeliveryInput = {
  readonly cell_id: CellId;
  readonly tenant_key: TenantKey;
  readonly recipient_principal_id: PrincipalId;
  readonly staging: InboxStagingPayload;
  readonly correlation_id: WriteCorrelationId;
};

export type EnqueueInboxDeliveryOutput = {
  readonly inbox_entry_id: InboxEntryId;
};

export type PendingInboxEntry = {
  readonly inbox_entry_id: InboxEntryId;
  readonly recipient_principal_id: PrincipalId;
  readonly staging: InboxStagingPayload;
  readonly enqueued_at_ms: number;
};

export type ListPendingInboxEntriesInput = {
  readonly cell_id: CellId;
  readonly tenant_key: TenantKey;
  readonly principal_id: PrincipalId;
  readonly limit: number;
  readonly cursor: DrainCursor;
};

export type ListPendingInboxEntriesOutput = {
  readonly entries: readonly PendingInboxEntry[];
  readonly next_cursor: DrainCursor;
};

export type FetchOutboxPayloadInput = {
  readonly cell_id: CellId;
  readonly locator: OutboxLocator;
  /** `stored` returns ciphertext bytes; `plaintext` decrypts encrypted post payloads. */
  readonly payload_format: "stored" | "plaintext";
};

export type FetchOutboxPayloadOutput = {
  readonly payload_bytes: Uint8Array;
  readonly content_hash: ContentHash;
  readonly bytes_available: boolean;
};

export type DeleteOutboxRecordInput = {
  readonly cell_id: CellId;
  readonly principal_id: PrincipalId;
  readonly record_key: OutboxRecordKey;
};

export type ListOutboxRecordsForPrincipalInput = {
  readonly cell_id: CellId;
  readonly tenant_key: TenantKey;
  readonly principal_id: PrincipalId;
  readonly post_kind?: string;
  readonly limit: number;
};

export type OutboxListedRecord = {
  readonly record_key: OutboxRecordKey;
  readonly content_hash: ContentHash;
  readonly metadata: JsonDocument;
  readonly committed_at_ms: number;
};

export type ResolvedPayload = {
  readonly inbox_entry_id: InboxEntryId;
  readonly pointer: PointerRef;
  readonly verified_bytes: Uint8Array;
};

export type VerifyAndDrainInboxBatchInput = {
  readonly cell_id: CellId;
  readonly tenant_key: TenantKey;
  readonly principal_id: PrincipalId;
  readonly inbox_entry_ids: readonly InboxEntryId[];
  readonly resolved_payloads: readonly ResolvedPayload[];
};

export type VerifyAndDrainInboxBatchOutput = {
  readonly drained_entry_ids: readonly InboxEntryId[];
  readonly failed_entry_ids: readonly InboxEntryId[];
};

// --- Catalog ---

export type UpsertDiscoveryDocumentInput = {
  readonly document_key: string;
  readonly body: JsonDocument;
};

export type UpsertDiscoveryDocumentOutput = {
  readonly revision_token: string;
};

export type UpsertCatalogPointerInput = {
  readonly catalog_pointer_id: CatalogPointerId;
  readonly locator: OutboxLocator;
  readonly content_hash: ContentHash;
  readonly public_projection: JsonDocument;
};

export type UpsertCatalogPointerOutput = Record<string, never>;

export type ResolveCatalogPointerInput = {
  readonly catalog_pointer_id: CatalogPointerId;
};

export type ResolveCatalogPointerOutput = {
  readonly locator: OutboxLocator;
  readonly content_hash: ContentHash;
  readonly cell: CellRef;
};

export type IssueConnectionTokenInput = {
  readonly principal_id: PrincipalId;
  readonly intended_audience: string;
  readonly ttl_seconds: number;
};

export type IssueConnectionTokenOutput = {
  readonly token: string;
  readonly expires_at_ms: number;
};

export type UpsertSourceMapPointerRowInput = {
  readonly tenant_key: TenantKey;
  readonly source_map_id: SourceMapId;
  readonly entry_key: string;
  readonly pointer: PointerRef;
  readonly projection: JsonDocument;
};

export type UpsertSourceMapPointerRowOutput = {
  readonly source_row_content_hash: ContentHash;
};

export type LookupSourceMapPointerInput = {
  readonly tenant_key: TenantKey;
  readonly source_map_id: SourceMapId;
  readonly entry_key: string;
};

/** When `found` is false, `pointer`/`projection` are sentinels; `source_row_content_hash` is all-zero. */
export type LookupSourceMapPointerOutput = {
  readonly found: boolean;
  readonly pointer: PointerRef;
  readonly source_row_content_hash: ContentHash;
  readonly projection: JsonDocument;
};

export type BatchLookupSourceMapPointersInput = {
  readonly tenant_key: TenantKey;
  readonly source_map_id: SourceMapId;
  readonly entry_keys: readonly string[];
};

export type BatchLookupSourceMapPointersOutput = {
  readonly hits: readonly SourceMapPointerHit[];
};

export type ComputeSourceRowContentHashInput = {
  readonly canonical_row_bytes: Uint8Array;
};

export type ComputeSourceRowContentHashOutput = {
  readonly content_hash: ContentHash;
};

// --- Publication ---

export type PublicationRouting = {
  readonly replicate_to_catalog: boolean;
  readonly catalog_envelope: JsonDocument;
  readonly fan_out_targets: readonly FanOutTarget[];
};

export type PostOperationInput = {
  readonly author_principal_id: PrincipalId;
  readonly author_cell_id: CellId;
  readonly tenant_key: TenantKey;
  readonly cell_pool_count: number;
  readonly payload_bytes: Uint8Array;
  readonly payload_metadata: JsonDocument;
  readonly routing: PublicationRouting;
  /** When non-empty, used as the outbox record key instead of generating one. */
  readonly outbox_record_key?: OutboxRecordKey;
};

export type GeneratedInboxRef = {
  readonly inbox_entry_id: InboxEntryId;
  readonly recipient_cell_id: CellId;
  readonly recipient_principal_id: PrincipalId;
};

export type PostOperationOutput = {
  readonly outbox_record_key: OutboxRecordKey;
  readonly content_hash: ContentHash;
  /** Empty string when catalog replication was skipped or produced no pointer row. */
  readonly catalog_pointer_id: CatalogPointerId;
  readonly generated_inbox_refs: readonly GeneratedInboxRef[];
};
