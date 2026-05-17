import type { CatalogPersistenceStrategy } from "./catalog-persistence-strategy.ts";
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
import { assertContentHash } from "./hash.ts";

/** Thin facade over {@link CatalogPersistenceStrategy}; room for shared validation later. */
export class CatalogPersistenceClient implements CatalogPersistenceStrategy {
  readonly nextCatalogPointerId?: (tenantKey: string) => string;
  readonly runImmediateTransactionForTenant?: <T>(tenantKey: string, fn: () => Promise<T>) => Promise<T>;

  constructor(private readonly strategy: CatalogPersistenceStrategy) {
    if (strategy.nextCatalogPointerId !== undefined) {
      this.nextCatalogPointerId = strategy.nextCatalogPointerId.bind(strategy);
    }
    if (strategy.runImmediateTransactionForTenant !== undefined) {
      this.runImmediateTransactionForTenant = strategy.runImmediateTransactionForTenant.bind(strategy);
    }
  }

  upsertDiscoveryDocument(
    input: UpsertDiscoveryDocumentInput,
  ): Promise<UpsertDiscoveryDocumentOutput> {
    return this.strategy.upsertDiscoveryDocument(input);
  }

  registerPercolationPredicate(
    input: RegisterPercolationPredicateInput,
  ): Promise<RegisterPercolationPredicateOutput> {
    return this.strategy.registerPercolationPredicate(input);
  }

  revokePercolationPredicate(
    input: RevokePercolationPredicateInput,
  ): Promise<RevokePercolationPredicateOutput> {
    return this.strategy.revokePercolationPredicate(input);
  }

  upsertCatalogPointer(input: UpsertCatalogPointerInput): Promise<UpsertCatalogPointerOutput> {
    return this.strategy.upsertCatalogPointer(input);
  }

  async resolveCatalogPointer(input: ResolveCatalogPointerInput): Promise<ResolveCatalogPointerOutput> {
    const out = await this.strategy.resolveCatalogPointer(input);
    assertContentHash(out.content_hash);
    return out;
  }

  async upsertSourceMapPointerRow(
    input: UpsertSourceMapPointerRowInput,
  ): Promise<UpsertSourceMapPointerRowOutput> {
    const out = await this.strategy.upsertSourceMapPointerRow(input);
    assertContentHash(out.source_row_content_hash);
    return out;
  }

  resolvePostFanOutTargets(
    input: ResolvePostFanOutTargetsInput,
  ): Promise<ResolvePostFanOutTargetsOutput> {
    return this.strategy.resolvePostFanOutTargets(input);
  }

  async lookupSourceMapPointer(input: LookupSourceMapPointerInput): Promise<LookupSourceMapPointerOutput> {
    const out = await this.strategy.lookupSourceMapPointer(input);
    if (out.found) {
      assertContentHash(out.pointer.content_hash);
      assertContentHash(out.source_row_content_hash);
    }
    return out;
  }

  async batchLookupSourceMapPointers(
    input: BatchLookupSourceMapPointersInput,
  ): Promise<BatchLookupSourceMapPointersOutput> {
    const out = await this.strategy.batchLookupSourceMapPointers(input);
    for (const h of out.hits) {
      assertContentHash(h.pointer.content_hash);
      assertContentHash(h.source_row_content_hash);
    }
    return out;
  }

  async computeSourceRowContentHash(
    input: ComputeSourceRowContentHashInput,
  ): Promise<ComputeSourceRowContentHashOutput> {
    const out = await this.strategy.computeSourceRowContentHash(input);
    assertContentHash(out.content_hash);
    return out;
  }

  issueConnectionToken(input: IssueConnectionTokenInput): Promise<IssueConnectionTokenOutput> {
    return this.strategy.issueConnectionToken(input);
  }
}
