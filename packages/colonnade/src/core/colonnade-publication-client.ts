import type { CatalogPersistence } from "../persistence/core/catalog-persistence";
import type { ResolveCell } from "../persistence/core/cell-persistence";
import { defaultNoopCatalogPersistence } from "../persistence/core/noop-catalog-persistence";
import type { PostOperationInput, PostOperationOutput } from "./colonnade-types";
import { randomId } from "./hash";
import type { InboxDelivery } from "./inbox-delivery";

/**
 * Commits the author outbox record and optional catalog projection.
 * Fan-out planning and delivery are deliberately host-owned asynchronous work.
 */
export class ColonnadePublicationClient {
  private readonly catalog: CatalogPersistence;
  private readonly resolveAuthor: ResolveCell;
  constructor(resolveAuthor: ResolveCell);
  /** @deprecated Inbox delivery is ignored; fan-out is host-owned. */
  constructor(resolveAuthor: ResolveCell, inboxDelivery: InboxDelivery);
  constructor(catalog: CatalogPersistence, resolveAuthor: ResolveCell);
  /** @deprecated Inbox delivery is ignored; fan-out is host-owned. */
  constructor(
    catalog: CatalogPersistence,
    resolveAuthor: ResolveCell,
    inboxDelivery: InboxDelivery,
  );
  constructor(
    a: CatalogPersistence | ResolveCell,
    b?: ResolveCell | InboxDelivery,
    _c?: InboxDelivery,
  ) {
    if (typeof a === "function") {
      this.catalog = defaultNoopCatalogPersistence();
      this.resolveAuthor = a;
    } else if (typeof b === "function") {
      this.catalog = a;
      this.resolveAuthor = b;
    } else {
      throw new Error("ColonnadePublicationClient: missing author cell resolver");
    }
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
    const publication = input.routing.catalog_publication;

    if (publication !== undefined) {
      const discoveryKey = `colonnade:publication:${input.tenant_key}:${appendOut.content_hash}`;
      catalogPointerId = this.catalog.nextCatalogPointerId?.(input.tenant_key) ?? randomId("cptr");

      const replicate = async () => {
        await this.catalog.upsertDiscoveryDocument({
          document_key: discoveryKey,
          body: publication.public_projection,
        });
        await this.catalog.upsertCatalogPointer({
          catalog_pointer_id: catalogPointerId,
          tenant_key: input.tenant_key,
          publication_key: publication.publication_key,
          publisher_principal_id: input.author_principal_id,
          published_at_ms: appendOut.committed_at_ms,
          tags: publication.tags,
          locator: {
            cell_id: input.author_cell_id,
            record_key: appendOut.record_key,
            cell_pool_count: input.cell_pool_count,
          },
          content_hash: appendOut.content_hash,
          public_projection: publication.public_projection,
        });
      };

      const txn = this.catalog.runImmediateTransactionForTenant;
      if (txn !== undefined) {
        await txn.call(this.catalog, input.tenant_key, replicate);
      } else {
        await replicate();
      }
    }

    return {
      outbox_record_key: appendOut.record_key,
      content_hash: appendOut.content_hash,
      catalog_pointer_id: catalogPointerId,
      fan_out_job_id: input.fan_out_job_id ?? "",
    };
  }
}
