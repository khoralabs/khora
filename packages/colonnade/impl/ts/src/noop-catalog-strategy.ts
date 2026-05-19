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
  PointerRef,
  ResolveCatalogPointerInput,
  ResolveCatalogPointerOutput,
  UpsertCatalogPointerInput,
  UpsertCatalogPointerOutput,
  UpsertDiscoveryDocumentInput,
  UpsertDiscoveryDocumentOutput,
  UpsertSourceMapPointerRowInput,
  UpsertSourceMapPointerRowOutput,
} from "./colonnade-types.ts";
import { canonicalSourceMapRowBytes, sha256HexLower } from "./hash.ts";

const ZERO_HASH = "0".repeat(64);

const MISS_POINTER: PointerRef = {
  source_cell_id: "_",
  source_record_key: "_",
  content_hash: ZERO_HASH,
};

/** Default when `PostOperation` runs with `replicate_to_catalog: false` (no discovery/pointer writes). */
export class NoopCatalogPersistenceStrategy implements CatalogPersistenceStrategy {
  async upsertDiscoveryDocument(
    _input: UpsertDiscoveryDocumentInput,
  ): Promise<UpsertDiscoveryDocumentOutput> {
    return { revision_token: "0" };
  }

  async upsertCatalogPointer(_input: UpsertCatalogPointerInput): Promise<UpsertCatalogPointerOutput> {
    return {};
  }

  async resolveCatalogPointer(input: ResolveCatalogPointerInput): Promise<ResolveCatalogPointerOutput> {
    throw new Error(
      `NoopCatalogPersistenceStrategy: unknown catalog_pointer_id ${input.catalog_pointer_id}`,
    );
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
    return { source_row_content_hash: sha256HexLower(bytes) };
  }

  async lookupSourceMapPointer(
    _input: LookupSourceMapPointerInput,
  ): Promise<LookupSourceMapPointerOutput> {
    return {
      found: false,
      pointer: { ...MISS_POINTER },
      source_row_content_hash: ZERO_HASH,
      projection: {},
    };
  }

  async batchLookupSourceMapPointers(
    _input: BatchLookupSourceMapPointersInput,
  ): Promise<BatchLookupSourceMapPointersOutput> {
    return { hits: [] };
  }

  async computeSourceRowContentHash(
    input: ComputeSourceRowContentHashInput,
  ): Promise<ComputeSourceRowContentHashOutput> {
    return { content_hash: sha256HexLower(input.canonical_row_bytes) };
  }

  async issueConnectionToken(input: IssueConnectionTokenInput): Promise<IssueConnectionTokenOutput> {
    return {
      token: "",
      expires_at_ms: Date.now() + input.ttl_seconds * 1000,
    };
  }
}

let sharedNoopCatalog: NoopCatalogPersistenceStrategy | undefined;

/** Shared singleton for clients that omit an explicit catalog strategy. */
export function defaultNoopCatalogPersistenceStrategy(): NoopCatalogPersistenceStrategy {
  sharedNoopCatalog ??= new NoopCatalogPersistenceStrategy();
  return sharedNoopCatalog;
}
