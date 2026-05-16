import type {
  BatchLookupSourceMapPointersInput,
  BatchLookupSourceMapPointersOutput,
  ComputeSourceRowContentHashInput,
  ComputeSourceRowContentHashOutput,
  IssueConnectionTokenInput,
  IssueConnectionTokenOutput,
  LookupSourceMapPointerInput,
  LookupSourceMapPointerOutput,
  RegisterPercolationPredicateInput,
  RegisterPercolationPredicateOutput,
  ResolveCatalogPointerInput,
  ResolveCatalogPointerOutput,
  ResolvePostFanOutTargetsInput,
  ResolvePostFanOutTargetsOutput,
  RevokePercolationPredicateInput,
  RevokePercolationPredicateOutput,
  UpsertCatalogPointerInput,
  UpsertCatalogPointerOutput,
  UpsertDiscoveryDocumentInput,
  UpsertDiscoveryDocumentOutput,
  UpsertSourceMapPointerRowInput,
  UpsertSourceMapPointerRowOutput,
} from "./colonnade-types.ts";

/**
 * Adapter for the **catalog** database model (`CatalogIndex` + `CatalogRead` in Smithy).
 * Swap implementations (in-memory, SQLite, remote service) without changing clients.
 */
export interface CatalogPersistenceStrategy {
  upsertDiscoveryDocument(
    input: UpsertDiscoveryDocumentInput,
  ): Promise<UpsertDiscoveryDocumentOutput>;
  registerPercolationPredicate(
    input: RegisterPercolationPredicateInput,
  ): Promise<RegisterPercolationPredicateOutput>;
  revokePercolationPredicate(
    input: RevokePercolationPredicateInput,
  ): Promise<RevokePercolationPredicateOutput>;
  upsertCatalogPointer(input: UpsertCatalogPointerInput): Promise<UpsertCatalogPointerOutput>;
  resolveCatalogPointer(input: ResolveCatalogPointerInput): Promise<ResolveCatalogPointerOutput>;
  upsertSourceMapPointerRow(
    input: UpsertSourceMapPointerRowInput,
  ): Promise<UpsertSourceMapPointerRowOutput>;

  resolvePostFanOutTargets(
    input: ResolvePostFanOutTargetsInput,
  ): Promise<ResolvePostFanOutTargetsOutput>;
  lookupSourceMapPointer(input: LookupSourceMapPointerInput): Promise<LookupSourceMapPointerOutput>;
  batchLookupSourceMapPointers(
    input: BatchLookupSourceMapPointersInput,
  ): Promise<BatchLookupSourceMapPointersOutput>;
  computeSourceRowContentHash(
    input: ComputeSourceRowContentHashInput,
  ): Promise<ComputeSourceRowContentHashOutput>;

  issueConnectionToken(input: IssueConnectionTokenInput): Promise<IssueConnectionTokenOutput>;
}
