import type {
  BatchLookupSourceMapPointersInput,
  BatchLookupSourceMapPointersOutput,
  CellRef,
  ComputeSourceRowContentHashInput,
  ComputeSourceRowContentHashOutput,
  CountPublicationPointersAfterInput,
  CountPublicationPointersAfterOutput,
  DeletePublicationPointerInput,
  DeletePublicationPointerOutput,
  DeletePublicationPointersByPublisherInput,
  DeletePublicationPointersByPublisherOutput,
  IssueConnectionTokenInput,
  IssueConnectionTokenOutput,
  ListPublicationPointersInput,
  ListPublicationPointersOutput,
  LookupSourceMapPointerInput,
  LookupSourceMapPointerOutput,
  OutboxLocator,
  PointerRef,
  PublicationPointerEntry,
  ResolveCatalogPointerInput,
  ResolveCatalogPointerOutput,
  UpsertCatalogPointerInput,
  UpsertCatalogPointerOutput,
  UpsertDiscoveryDocumentInput,
  UpsertDiscoveryDocumentOutput,
  UpsertSourceMapPointerRowInput,
  UpsertSourceMapPointerRowOutput,
} from "../../core/colonnade-types";
import { canonicalSourceMapRowBytes, sha256HexLower } from "../../core/hash";
import { encodeCatalogPointerId } from "../../core/routing/catalog-pointer-id";
import type { CatalogPersistence } from "./catalog-persistence";
import {
  decodePublicationFeedCursor,
  encodePublicationFeedCursor,
  publicationMatchesTagsAll,
} from "./publication-feed-query";

const ZERO_HASH = "0".repeat(64);

/** Sentinel **`PointerRef`** when **`LookupSourceMapPointerOutput.found`** is false (valid Smithy patterns). */
const MISS_POINTER: PointerRef = {
  source_cell_id: "_",
  source_record_key: "_",
  content_hash: ZERO_HASH,
  cell_pool_count: 1,
};

function sourceMapStoreKey(tenant_key: string, source_map_id: string): string {
  return `${tenant_key}\0${source_map_id}`;
}

type PointerRow = {
  tenant_key: string;
  publication_key: string;
  publisher_principal_id: string;
  published_at_ms: number;
  tags: readonly string[];
  locator: OutboxLocator;
  content_hash: string;
  cell: CellRef;
  projection: unknown;
};

/** Mutable **catalog** index for tests. */
export class InMemoryCatalogPersistence implements CatalogPersistence {
  nextCatalogPointerId(_tenantKey: string): string {
    void _tenantKey;
    return encodeCatalogPointerId(0);
  }

  async runImmediateTransactionForTenant<T>(_tenantKey: string, fn: () => Promise<T>): Promise<T> {
    void _tenantKey;
    return fn();
  }

  private readonly discovery = new Map<string, { body: unknown; revision: number }>();
  private readonly pointers = new Map<string, PointerRow>();
  /** tenant\0publication_key → catalog_pointer_id */
  private readonly publicationIndex = new Map<string, string>();
  /** Source-map rows: storeKey → entry_key → row */
  private readonly sourceMaps = new Map<
    string,
    Map<string, { pointer: PointerRef; projection: unknown; source_row_content_hash: string }>
  >();
  private tokenSeq = 0;

  async upsertDiscoveryDocument(
    input: UpsertDiscoveryDocumentInput,
  ): Promise<UpsertDiscoveryDocumentOutput> {
    const prev = this.discovery.get(input.document_key);
    const revision = (prev?.revision ?? 0) + 1;
    this.discovery.set(input.document_key, { body: input.body, revision });
    return { revision_token: String(revision) };
  }

  async upsertCatalogPointer(
    input: UpsertCatalogPointerInput,
  ): Promise<UpsertCatalogPointerOutput> {
    const pubKey = `${input.tenant_key}\0${input.publication_key}`;
    const previousId = this.publicationIndex.get(pubKey);
    if (previousId !== undefined && previousId !== input.catalog_pointer_id) {
      this.pointers.delete(previousId);
    }
    this.publicationIndex.set(pubKey, input.catalog_pointer_id);
    this.pointers.set(input.catalog_pointer_id, {
      tenant_key: input.tenant_key,
      publication_key: input.publication_key,
      publisher_principal_id: input.publisher_principal_id,
      published_at_ms: input.published_at_ms,
      tags: [...input.tags],
      locator: { ...input.locator },
      content_hash: input.content_hash,
      cell: {
        cell_id: input.locator.cell_id,
        tenant_key: input.tenant_key,
      },
      projection: input.public_projection,
    });
    return {};
  }

  async resolveCatalogPointer(
    input: ResolveCatalogPointerInput,
  ): Promise<ResolveCatalogPointerOutput> {
    const row = this.pointers.get(input.catalog_pointer_id);
    if (row === undefined) {
      throw new Error(
        `InMemoryCatalogPersistence: unknown catalog_pointer_id ${input.catalog_pointer_id}`,
      );
    }
    return {
      locator: { ...row.locator },
      content_hash: row.content_hash,
      cell: { ...row.cell },
    };
  }

  async deletePublicationPointer(
    input: DeletePublicationPointerInput,
  ): Promise<DeletePublicationPointerOutput> {
    const pubKey = `${input.tenant_key}\0${input.publication_key}`;
    const id = this.publicationIndex.get(pubKey);
    if (id === undefined) return { deleted: false };
    this.publicationIndex.delete(pubKey);
    this.pointers.delete(id);
    return { deleted: true };
  }

  async deletePublicationPointersByPublisher(
    input: DeletePublicationPointersByPublisherInput,
  ): Promise<DeletePublicationPointersByPublisherOutput> {
    let deleted_count = 0;
    for (const [id, row] of [...this.pointers.entries()]) {
      if (
        row.tenant_key === input.tenant_key &&
        row.publisher_principal_id === input.publisher_principal_id
      ) {
        this.pointers.delete(id);
        this.publicationIndex.delete(`${row.tenant_key}\0${row.publication_key}`);
        deleted_count += 1;
      }
    }
    return { deleted_count };
  }

  async listPublicationPointers(
    input: ListPublicationPointersInput,
  ): Promise<ListPublicationPointersOutput> {
    const cursor =
      input.cursor !== undefined && input.cursor.length > 0
        ? decodePublicationFeedCursor(input.cursor)
        : undefined;
    const tags = input.tags_all ?? [];
    const rows: PublicationPointerEntry[] = [];
    for (const [catalog_pointer_id, row] of this.pointers) {
      if (row.tenant_key !== input.tenant_key) continue;
      if (
        input.publisher_principal_id !== undefined &&
        row.publisher_principal_id !== input.publisher_principal_id
      ) {
        continue;
      }
      if (!publicationMatchesTagsAll(row.tags, tags)) continue;
      if (cursor !== undefined) {
        if (
          row.published_at_ms > cursor.ts ||
          (row.published_at_ms === cursor.ts && catalog_pointer_id >= cursor.id)
        ) {
          continue;
        }
      }
      rows.push({
        catalog_pointer_id,
        publication_key: row.publication_key,
        publisher_principal_id: row.publisher_principal_id,
        published_at_ms: row.published_at_ms,
        tags: [...row.tags],
        locator: { ...row.locator },
        content_hash: row.content_hash,
        public_projection: row.projection,
      });
    }
    rows.sort((a, b) => {
      if (a.published_at_ms !== b.published_at_ms) return b.published_at_ms - a.published_at_ms;
      return a.catalog_pointer_id < b.catalog_pointer_id
        ? 1
        : a.catalog_pointer_id > b.catalog_pointer_id
          ? -1
          : 0;
    });
    const limit = Math.max(0, Math.floor(input.limit));
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      entries: page,
      next_cursor:
        page.length === limit && last !== undefined
          ? encodePublicationFeedCursor({
              ts: last.published_at_ms,
              id: last.catalog_pointer_id,
            })
          : "",
    };
  }

  async countPublicationPointersAfter(
    input: CountPublicationPointersAfterInput,
  ): Promise<CountPublicationPointersAfterOutput> {
    const tags = input.tags_all ?? [];
    let count = 0;
    for (const row of this.pointers.values()) {
      if (row.tenant_key !== input.tenant_key) continue;
      if (row.published_at_ms <= input.after_ms) continue;
      if (
        input.publisher_principal_id !== undefined &&
        row.publisher_principal_id !== input.publisher_principal_id
      ) {
        continue;
      }
      if (!publicationMatchesTagsAll(row.tags, tags)) continue;
      count += 1;
    }
    return { count };
  }

  async upsertSourceMapPointerRow(
    input: UpsertSourceMapPointerRowInput,
  ): Promise<UpsertSourceMapPointerRowOutput> {
    const bytes = canonicalSourceMapRowBytes({
      tenant_key: input.tenant_key,
      source_map_id: input.source_map_id,
      entry_key: input.entry_key,
      pointer: input.pointer,
      projection: input.projection,
    });
    const source_row_content_hash = sha256HexLower(bytes);
    const sk = sourceMapStoreKey(input.tenant_key, input.source_map_id);
    let m = this.sourceMaps.get(sk);
    if (m === undefined) {
      m = new Map();
      this.sourceMaps.set(sk, m);
    }
    m.set(input.entry_key, {
      pointer: { ...input.pointer },
      projection: input.projection,
      source_row_content_hash,
    });
    return { source_row_content_hash };
  }

  async lookupSourceMapPointer(
    input: LookupSourceMapPointerInput,
  ): Promise<LookupSourceMapPointerOutput> {
    const sk = sourceMapStoreKey(input.tenant_key, input.source_map_id);
    const hit = this.sourceMaps.get(sk)?.get(input.entry_key);
    if (hit === undefined) {
      return {
        found: false,
        pointer: { ...MISS_POINTER },
        source_row_content_hash: ZERO_HASH,
        projection: {},
      };
    }
    return {
      found: true,
      pointer: { ...hit.pointer },
      source_row_content_hash: hit.source_row_content_hash,
      projection: hit.projection,
    };
  }

  async batchLookupSourceMapPointers(
    input: BatchLookupSourceMapPointersInput,
  ): Promise<BatchLookupSourceMapPointersOutput> {
    const sk = sourceMapStoreKey(input.tenant_key, input.source_map_id);
    const m = this.sourceMaps.get(sk);
    const hits = [];
    if (m !== undefined) {
      for (const entry_key of input.entry_keys) {
        const hit = m.get(entry_key);
        if (hit !== undefined) {
          hits.push({
            entry_key,
            pointer: { ...hit.pointer },
            source_row_content_hash: hit.source_row_content_hash,
            projection: hit.projection,
          });
        }
      }
    }
    return { hits };
  }

  async computeSourceRowContentHash(
    input: ComputeSourceRowContentHashInput,
  ): Promise<ComputeSourceRowContentHashOutput> {
    return { content_hash: sha256HexLower(input.canonical_row_bytes) };
  }

  async issueConnectionToken(
    input: IssueConnectionTokenInput,
  ): Promise<IssueConnectionTokenOutput> {
    this.tokenSeq += 1;
    const expires_at_ms = Date.now() + input.ttl_seconds * 1000;
    return {
      token: `tok_${this.tokenSeq}_${input.principal_id}`,
      expires_at_ms,
    };
  }
}
