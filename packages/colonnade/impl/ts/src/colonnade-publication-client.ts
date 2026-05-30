import type { CatalogPersistenceStrategy } from "./catalog-persistence-strategy";
import type { ResolveCellStrategy } from "./cell-persistence-strategy";
import type {
  FanOutTarget,
  GeneratedInboxRef,
  PostOperationInput,
  PostOperationOutput,
  PublicationRouting,
} from "./colonnade-types";
import { randomId } from "./hash";
import { defaultNoopCatalogPersistenceStrategy } from "./noop-catalog-strategy";
import { supportsSqliteCellBatch } from "./sqlite/sqlite-cell-strategy";

function isResolveCellStrategy(
  value: CatalogPersistenceStrategy | ResolveCellStrategy,
): value is ResolveCellStrategy {
  return typeof value === "function";
}

/** Implements **`PostOperation`** ordering: author outbox → catalog (optional) → per-recipient inbox. */
export class ColonnadePublicationClient {
  private readonly catalog: CatalogPersistenceStrategy;
  private readonly resolveCell: ResolveCellStrategy;

  /** Pass `resolveCell` only to use the built-in noop catalog (no `replicate_to_catalog` writes). */
  constructor(resolveCell: ResolveCellStrategy);
  constructor(catalog: CatalogPersistenceStrategy, resolveCell: ResolveCellStrategy);
  constructor(
    catalogOrResolveCell: CatalogPersistenceStrategy | ResolveCellStrategy,
    maybeResolveCell?: ResolveCellStrategy,
  ) {
    if (maybeResolveCell !== undefined) {
      this.catalog = catalogOrResolveCell as CatalogPersistenceStrategy;
      this.resolveCell = maybeResolveCell;
    } else if (isResolveCellStrategy(catalogOrResolveCell)) {
      this.catalog = defaultNoopCatalogPersistenceStrategy();
      this.resolveCell = catalogOrResolveCell;
    } else {
      throw new Error(
        "ColonnadePublicationClient: pass ResolveCellStrategy alone, or (CatalogPersistenceStrategy, ResolveCellStrategy)",
      );
    }
  }

  async postOperation(input: PostOperationInput): Promise<PostOperationOutput> {
    const authorCell = this.resolveCell(input.author_cell_id);

    const appendOut = await authorCell.appendOutboxRecord({
      cell_id: input.author_cell_id,
      tenant_key: input.tenant_key,
      principal_id: input.author_principal_id,
      record_key: input.outbox_record_key ?? "",
      payload_bytes: input.payload_bytes,
      metadata: input.payload_metadata,
    });

    let catalogPointerId = "";

    if (input.routing.replicate_to_catalog) {
      const discoveryKey = `colonnade:publication:${input.tenant_key}:${appendOut.content_hash}`;
      catalogPointerId = this.catalog.nextCatalogPointerId?.(input.tenant_key) ?? randomId("cptr");

      const replicate = async () => {
        await this.catalog.upsertDiscoveryDocument({
          document_key: discoveryKey,
          body: input.routing.catalog_envelope,
        });
        await this.catalog.upsertCatalogPointer({
          catalog_pointer_id: catalogPointerId,
          locator: {
            cell_id: input.author_cell_id,
            record_key: appendOut.record_key,
            cell_pool_count: input.cell_pool_count,
          },
          content_hash: appendOut.content_hash,
          public_projection: input.routing.catalog_envelope,
        });
      };

      const txn = this.catalog.runImmediateTransactionForTenant;
      if (txn !== undefined) {
        await txn.call(this.catalog, input.tenant_key, replicate);
      } else {
        await replicate();
      }
    }

    const fanRefs = await this.fanOutInboxDeliveries(
      input.routing,
      appendOut.content_hash,
      input.author_cell_id,
      appendOut.record_key,
      input.tenant_key,
      input.cell_pool_count,
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
    cellPoolCount: number,
  ): Promise<readonly GeneratedInboxRef[]> {
    const byCell = new Map<string, FanOutTarget[]>();
    for (const target of routing.fan_out_targets) {
      const list = byCell.get(target.recipient_cell_id);
      if (list === undefined) {
        byCell.set(target.recipient_cell_id, [target]);
      } else {
        list.push(target);
      }
    }

    const inboxIdsByCell = new Map<string, string[]>();

    await Promise.all(
      [...byCell.entries()].map(async ([recipientCellId, targets]) => {
        const cell = this.resolveCell(recipientCellId);
        const deliveries = targets.map((target) => ({
          cell_id: target.recipient_cell_id,
          tenant_key: tenantKey,
          recipient_principal_id: target.recipient_principal_id,
          staging: stagingForFanOut(
            target,
            authorCellId,
            authorRecordKey,
            contentHash,
            cellPoolCount,
          ),
          correlation_id: randomId("fan"),
        }));

        if (supportsSqliteCellBatch(cell) && deliveries.length > 1) {
          const outs = await cell.enqueueInboxDeliveriesBatch(deliveries);
          inboxIdsByCell.set(
            recipientCellId,
            outs.map((o) => o.inbox_entry_id),
          );
          return;
        }

        const ids: string[] = [];
        for (const target of targets) {
          const staging = stagingForFanOut(
            target,
            authorCellId,
            authorRecordKey,
            contentHash,
            cellPoolCount,
          );
          const out = await cell.enqueueInboxDelivery({
            cell_id: target.recipient_cell_id,
            tenant_key: tenantKey,
            recipient_principal_id: target.recipient_principal_id,
            staging,
            correlation_id: randomId("fan"),
          });
          ids.push(out.inbox_entry_id);
        }
        inboxIdsByCell.set(recipientCellId, ids);
      }),
    );

    const refs: GeneratedInboxRef[] = [];
    for (const target of routing.fan_out_targets) {
      const ids = inboxIdsByCell.get(target.recipient_cell_id);
      const inbox_entry_id = ids?.shift();
      if (inbox_entry_id === undefined) {
        throw new Error(
          "ColonnadePublicationClient: missing inbox enqueue result for fan-out target",
        );
      }
      refs.push({
        inbox_entry_id,
        recipient_cell_id: target.recipient_cell_id,
        recipient_principal_id: target.recipient_principal_id,
      });
    }
    return refs;
  }
}

function stagingForFanOut(
  target: FanOutTarget,
  authorCellId: string,
  authorRecordKey: string,
  contentHash: string,
  cellPoolCount: number,
): import("./colonnade-types.ts").InboxStagingPayload {
  const pointer = {
    source_cell_id: authorCellId,
    source_record_key: authorRecordKey,
    content_hash: contentHash,
    cell_pool_count: cellPoolCount,
  };
  return {
    kind: "pointer",
    pointer: {
      pointer,
      ...(target.inbox_metadata !== undefined ? { metadata: target.inbox_metadata } : {}),
    },
  };
}
