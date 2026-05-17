import type { CatalogPersistenceStrategy } from "./catalog-persistence-strategy.ts";
import type {
  BatchLookupSourceMapPointersInput,
  BatchLookupSourceMapPointersOutput,
  CellRef,
  ComputeSourceRowContentHashInput,
  ComputeSourceRowContentHashOutput,
  IssueConnectionTokenInput,
  IssueConnectionTokenOutput,
  LookupSourceMapPointerInput,
  LookupSourceMapPointerOutput,
  OutboxLocator,
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
import { encodeCatalogPointerId } from "./sqlite/catalog-pointer-id.ts";

const ZERO_HASH = "0".repeat(64);

/** Sentinel **`PointerRef`** when **`LookupSourceMapPointerOutput.found`** is false (valid Smithy patterns). */
const MISS_POINTER: PointerRef = {
  source_cell_id: "_",
  source_record_key: "_",
  content_hash: ZERO_HASH,
};

function sourceMapStoreKey(tenant_key: string, source_map_id: string): string {
  return `${tenant_key}\0${source_map_id}`;
}

/** Mutable **catalog** index for tests. */
export class InMemoryCatalogPersistenceStrategy implements CatalogPersistenceStrategy {
  nextCatalogPointerId(_tenantKey: string): string {
    void _tenantKey;
    return encodeCatalogPointerId(0);
  }

  async runImmediateTransactionForTenant<T>(_tenantKey: string, fn: () => Promise<T>): Promise<T> {
    void _tenantKey;
    return fn();
  }

  private readonly discovery = new Map<string, { body: unknown; revision: number }>();
  private readonly pointers = new Map<
    string,
    {
      locator: OutboxLocator;
      content_hash: string;
      cell: CellRef;
      projection: unknown;
    }
  >();
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
    this.pointers.set(input.catalog_pointer_id, {
      locator: { ...input.locator },
      content_hash: input.content_hash,
      cell: {
        cell_id: input.locator.cell_id,
        tenant_key: "",
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
        `InMemoryCatalogPersistenceStrategy: unknown catalog_pointer_id ${input.catalog_pointer_id}`,
      );
    }
    return {
      locator: { ...row.locator },
      content_hash: row.content_hash,
      cell: { ...row.cell },
    };
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
