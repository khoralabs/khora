import type { CatalogPersistence } from "../persistence/core/catalog-persistence";
import type { ResolveCell } from "../persistence/core/cell-persistence";
import { defaultNoopCatalogPersistence } from "../persistence/core/noop-catalog-persistence";
import type { PostOperationInput, PostOperationOutput } from "./colonnade-types";
import { randomId } from "./hash";
import type { InboxDelivery } from "./inbox-delivery";
import { createResolveCellInboxDelivery } from "./resolve-cell-inbox-delivery";

function isResolveCell(
  value: CatalogPersistence | ResolveCell | InboxDelivery,
): value is ResolveCell {
  return typeof value === "function";
}

function isInboxDelivery(value: unknown): value is InboxDelivery {
  return (
    typeof value === "object" &&
    value !== null &&
    "deliver" in value &&
    typeof (value as InboxDelivery).deliver === "function"
  );
}

/**
 * Implements **`PostOperation`**: author outbox commit → optional catalog → {@link InboxDelivery}.
 *
 * Fan-out does not open cell DBs here. Delivery of inbox pointers is delegated to
 * {@link InboxDelivery} so local per-DB opens and future multiplexed cell-node /
 * cell-pool connections share the same publication path.
 */
export class ColonnadePublicationClient {
  private readonly catalog: CatalogPersistence;
  private readonly resolveAuthor: ResolveCell;
  private readonly inboxDelivery: InboxDelivery;

  /** Legacy: `resolveCell` only (noop catalog + ResolveCellInboxDelivery). */
  constructor(resolveCell: ResolveCell);
  /** Legacy: catalog + resolveCell for author and fan-out. */
  constructor(catalog: CatalogPersistence, resolveCell: ResolveCell);
  /**
   * Preferred: author cell accessor + abstract inbox delivery.
   * Pass catalog as the first arg when replicating to catalog.
   */
  constructor(resolveAuthor: ResolveCell, inboxDelivery: InboxDelivery);
  constructor(
    catalog: CatalogPersistence,
    resolveAuthor: ResolveCell,
    inboxDelivery: InboxDelivery,
  );
  constructor(
    a: CatalogPersistence | ResolveCell,
    b?: ResolveCell | InboxDelivery,
    c?: InboxDelivery,
  ) {
    if (c !== undefined && isInboxDelivery(c) && b !== undefined && isResolveCell(b)) {
      this.catalog = a as CatalogPersistence;
      this.resolveAuthor = b;
      this.inboxDelivery = c;
      return;
    }
    if (b !== undefined && isInboxDelivery(b) && isResolveCell(a)) {
      this.catalog = defaultNoopCatalogPersistence();
      this.resolveAuthor = a;
      this.inboxDelivery = b;
      return;
    }
    if (b !== undefined && isResolveCell(b)) {
      this.catalog = a as CatalogPersistence;
      this.resolveAuthor = b;
      this.inboxDelivery = createResolveCellInboxDelivery(b);
      return;
    }
    if (isResolveCell(a)) {
      this.catalog = defaultNoopCatalogPersistence();
      this.resolveAuthor = a;
      this.inboxDelivery = createResolveCellInboxDelivery(a);
      return;
    }
    throw new Error(
      "ColonnadePublicationClient: pass ResolveCell; (Catalog, ResolveCell); (ResolveCell, InboxDelivery); or (Catalog, ResolveCell, InboxDelivery)",
    );
  }

  async postOperation(input: PostOperationInput): Promise<PostOperationOutput> {
    const authorCell = this.resolveAuthor(input.author_cell_id);

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

    const pointer = {
      source_cell_id: input.author_cell_id,
      source_record_key: appendOut.record_key,
      content_hash: appendOut.content_hash,
      cell_pool_count: input.cell_pool_count,
    };

    const delivery = await this.inboxDelivery.deliver({
      pointer,
      targets: input.routing.fan_out_targets,
      tenant_key: input.tenant_key,
    });

    return {
      outbox_record_key: appendOut.record_key,
      content_hash: appendOut.content_hash,
      catalog_pointer_id: catalogPointerId,
      generated_inbox_refs: delivery.generated_inbox_refs,
    };
  }
}
