import type { CatalogPersistenceStrategy } from "./catalog-persistence-strategy.ts";
import type { ResolveCellStrategy } from "./cell-persistence-strategy.ts";
import type {
  FanOutTarget,
  GeneratedInboxRef,
  PostOperationInput,
  PostOperationOutput,
  PublicationRouting,
} from "./colonnade-types.ts";
import { randomId } from "./hash.ts";

const INLINE_MAX_BYTES = 2048;

/** Implements **`PostOperation`** ordering: author outbox → catalog (optional) → per-recipient inbox. */
export class ColonnadePublicationClient {
  constructor(
    private readonly catalog: CatalogPersistenceStrategy,
    private readonly resolveCell: ResolveCellStrategy,
  ) {}

  async postOperation(input: PostOperationInput): Promise<PostOperationOutput> {
    const authorCell = this.resolveCell(input.author_cell_id);

    const appendOut = await authorCell.appendOutboxRecord({
      cell_id: input.author_cell_id,
      tenant_key: input.tenant_key,
      principal_id: input.author_principal_id,
      record_key: "",
      payload_bytes: input.payload_bytes,
      metadata: input.payload_metadata,
    });

    let catalogPointerId = "";

    if (input.routing.replicate_to_catalog) {
      await this.catalog.upsertDiscoveryDocument({
        document_key: `colonnade:publication:${appendOut.content_hash}`,
        body: input.routing.catalog_envelope,
      });
      catalogPointerId = randomId("cptr");
      await this.catalog.upsertCatalogPointer({
        catalog_pointer_id: catalogPointerId,
        locator: {
          cell_id: input.author_cell_id,
          record_key: appendOut.record_key,
        },
        content_hash: appendOut.content_hash,
        public_projection: input.routing.catalog_envelope,
      });
    }

    const fanRefs = await this.fanOutInboxDeliveries(
      input.routing,
      appendOut.content_hash,
      input.author_cell_id,
      appendOut.record_key,
      input.tenant_key,
      input.payload_bytes,
    );

    return {
      outbox_record_key: appendOut.record_key,
      content_hash: appendOut.content_hash,
      catalog_pointer_id: catalogPointerId,
      generated_inbox_refs: fanRefs,
    };
  }

  private async fanOutInboxDeliveries(
    routing: PublicationRouting,
    contentHash: string,
    authorCellId: string,
    authorRecordKey: string,
    tenantKey: string,
    payloadBytes: Uint8Array,
  ): Promise<readonly GeneratedInboxRef[]> {
    const refs: GeneratedInboxRef[] = [];
    for (const target of routing.fan_out_targets) {
      const staging = stagingForFanOut(
        target,
        authorCellId,
        authorRecordKey,
        contentHash,
        payloadBytes,
      );
      const cell = this.resolveCell(target.recipient_cell_id);
      const out = await cell.enqueueInboxDelivery({
        cell_id: target.recipient_cell_id,
        tenant_key: tenantKey,
        recipient_principal_id: target.recipient_principal_id,
        staging,
        correlation_id: randomId("fan"),
      });
      refs.push({
        inbox_entry_id: out.inbox_entry_id,
        recipient_cell_id: target.recipient_cell_id,
        recipient_principal_id: target.recipient_principal_id,
      });
    }
    return refs;
  }
}

function stagingForFanOut(
  _target: FanOutTarget,
  authorCellId: string,
  authorRecordKey: string,
  contentHash: string,
  payloadBytes: Uint8Array,
): import("./colonnade-types.ts").InboxStagingPayload {
  if (payloadBytes.byteLength <= INLINE_MAX_BYTES) {
    return {
      kind: "inline",
      inline: { bytes: payloadBytes, content_hash: contentHash },
    };
  }
  return {
    kind: "pointer",
    pointer: {
      pointer: {
        source_cell_id: authorCellId,
        source_record_key: authorRecordKey,
        content_hash: contentHash,
      },
    },
  };
}
