import type {
  BatchLookupSourceMapPointersInput,
  BatchLookupSourceMapPointersOutput,
  ComputeSourceRowContentHashInput,
  ComputeSourceRowContentHashOutput,
  IssueConnectionTokenInput,
  IssueConnectionTokenOutput,
  LookupSourceMapPointerInput,
  LookupSourceMapPointerOutput,
  ResolveCatalogPointerInput,
  ResolveCatalogPointerOutput,
  UpsertCatalogPointerInput,
  UpsertCatalogPointerOutput,
  UpsertDiscoveryDocumentInput,
  UpsertDiscoveryDocumentOutput,
  UpsertSourceMapPointerRowInput,
  UpsertSourceMapPointerRowOutput,
} from "./colonnade-types";

/**
 * Adapter for the **catalog** database model (`CatalogIndex` + `CatalogRead` in Smithy).
 * Swap implementations (in-memory, SQLite, remote service) without changing clients.
 */
export interface CatalogPersistenceStrategy {
  /** When set, allocates **`catalog_pointer_id`** values routable under tenant-key catalog sharding (`cptr_HHHH_…`). */
  nextCatalogPointerId?(tenantKey: string): string;

  /**
   * **`BEGIN IMMEDIATE` … `COMMIT`** on the catalog shard that owns **`tenant_key`** (SQLite).
   * Implementations omit this when they do not use SQLite or do not shard by tenant.
   */
  runImmediateTransactionForTenant?<T>(tenantKey: string, fn: () => Promise<T>): Promise<T>;

  upsertDiscoveryDocument(
    input: UpsertDiscoveryDocumentInput,
  ): Promise<UpsertDiscoveryDocumentOutput>;
  upsertCatalogPointer(input: UpsertCatalogPointerInput): Promise<UpsertCatalogPointerOutput>;
  resolveCatalogPointer(input: ResolveCatalogPointerInput): Promise<ResolveCatalogPointerOutput>;
  upsertSourceMapPointerRow(
    input: UpsertSourceMapPointerRowInput,
  ): Promise<UpsertSourceMapPointerRowOutput>;

  lookupSourceMapPointer(input: LookupSourceMapPointerInput): Promise<LookupSourceMapPointerOutput>;
  batchLookupSourceMapPointers(
    input: BatchLookupSourceMapPointersInput,
  ): Promise<BatchLookupSourceMapPointersOutput>;
  computeSourceRowContentHash(
    input: ComputeSourceRowContentHashInput,
  ): Promise<ComputeSourceRowContentHashOutput>;

  issueConnectionToken(input: IssueConnectionTokenInput): Promise<IssueConnectionTokenOutput>;
}
