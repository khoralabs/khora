import type { CatalogPersistenceStrategy } from "./catalog-persistence-strategy";
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
import { parseCatalogPointerShardIndex } from "./routing/catalog-pointer-id";
import { catalogShardIndexForTenant } from "./routing/tenant-catalog-shard";

/**
 * Tenant-key **routing façade** over catalog SQLite shards (**`catalogShardCount`** files).
 * **`resolveCatalogPointer`** prefers shard ids encoded as **`cptr_HHHH_…`**; legacy ids are resolved by probing shards.
 */
export class ShardingCatalogPersistenceStrategy implements CatalogPersistenceStrategy {
  readonly nextCatalogPointerId: (tenantKey: string) => string;
  readonly runImmediateTransactionForTenant: <T>(
    tenantKey: string,
    fn: () => Promise<T>,
  ) => Promise<T>;

  constructor(private readonly shards: readonly CatalogPersistenceStrategy[]) {
    if (shards.length < 1) {
      throw new Error("ShardingCatalogPersistenceStrategy: need at least one shard");
    }
    this.nextCatalogPointerId = (tenantKey: string) => {
      const i = catalogShardIndexForTenant(tenantKey, shards.length);
      const leaf = shards[i];
      if (leaf === undefined) {
        throw new Error("ShardingCatalogPersistenceStrategy: shard index out of range");
      }
      const gen = leaf.nextCatalogPointerId;
      if (gen === undefined) {
        throw new Error("ShardingCatalogPersistenceStrategy: shard missing nextCatalogPointerId");
      }
      return gen.call(leaf, tenantKey);
    };
    this.runImmediateTransactionForTenant = async <T>(
      tenantKey: string,
      fn: () => Promise<T>,
    ): Promise<T> => {
      const i = catalogShardIndexForTenant(tenantKey, shards.length);
      const leaf = shards[i];
      if (leaf === undefined) {
        throw new Error("ShardingCatalogPersistenceStrategy: shard index out of range");
      }
      const run = leaf.runImmediateTransactionForTenant;
      if (run === undefined) {
        return fn();
      }
      return run.call(leaf, tenantKey, fn) as Promise<T>;
    };
  }

  private shardForTenantKey(tenantKey: string): CatalogPersistenceStrategy {
    const i = catalogShardIndexForTenant(tenantKey, this.shards.length);
    const s = this.shards[i];
    if (s === undefined) {
      throw new Error("ShardingCatalogPersistenceStrategy: shard index out of range");
    }
    return s;
  }

  /** Prefer **`colonnade:publication:${tenant_key}:…`** keys for tenant-local routing; otherwise hash **`document_key`**. */
  private shardForDiscoveryKey(documentKey: string): CatalogPersistenceStrategy {
    const m = /^colonnade:publication:([^:]+):/.exec(documentKey);
    if (m?.[1] !== undefined) {
      return this.shardForTenantKey(m[1]);
    }
    const i = catalogShardIndexForTenant(documentKey, this.shards.length);
    const s = this.shards[i];
    if (s === undefined) {
      throw new Error("ShardingCatalogPersistenceStrategy: shard index out of range");
    }
    return s;
  }

  upsertDiscoveryDocument(
    input: UpsertDiscoveryDocumentInput,
  ): Promise<UpsertDiscoveryDocumentOutput> {
    return this.shardForDiscoveryKey(input.document_key).upsertDiscoveryDocument(input);
  }

  upsertCatalogPointer(input: UpsertCatalogPointerInput): Promise<UpsertCatalogPointerOutput> {
    const idx = parseCatalogPointerShardIndex(input.catalog_pointer_id);
    if (idx !== null) {
      const s = this.shards[idx];
      if (s === undefined) {
        throw new Error(`ShardingCatalogPersistenceStrategy: encoded shard ${idx} out of range`);
      }
      return s.upsertCatalogPointer(input);
    }
    const head = this.shards[0];
    if (head === undefined) {
      throw new Error("ShardingCatalogPersistenceStrategy: no shards");
    }
    return head.upsertCatalogPointer(input);
  }

  async resolveCatalogPointer(
    input: ResolveCatalogPointerInput,
  ): Promise<ResolveCatalogPointerOutput> {
    const idx = parseCatalogPointerShardIndex(input.catalog_pointer_id);
    if (idx !== null) {
      const s = this.shards[idx];
      if (s === undefined) {
        throw new Error(`ShardingCatalogPersistenceStrategy: encoded shard ${idx} out of range`);
      }
      return s.resolveCatalogPointer(input);
    }
    for (const s of this.shards) {
      try {
        return await s.resolveCatalogPointer(input);
      } catch {}
    }
    throw new Error(
      `ShardingCatalogPersistenceStrategy: unknown catalog_pointer_id ${input.catalog_pointer_id}`,
    );
  }

  upsertSourceMapPointerRow(
    input: UpsertSourceMapPointerRowInput,
  ): Promise<UpsertSourceMapPointerRowOutput> {
    return this.shardForTenantKey(input.tenant_key).upsertSourceMapPointerRow(input);
  }

  lookupSourceMapPointer(
    input: LookupSourceMapPointerInput,
  ): Promise<LookupSourceMapPointerOutput> {
    return this.shardForTenantKey(input.tenant_key).lookupSourceMapPointer(input);
  }

  batchLookupSourceMapPointers(
    input: BatchLookupSourceMapPointersInput,
  ): Promise<BatchLookupSourceMapPointersOutput> {
    return this.shardForTenantKey(input.tenant_key).batchLookupSourceMapPointers(input);
  }

  computeSourceRowContentHash(
    input: ComputeSourceRowContentHashInput,
  ): Promise<ComputeSourceRowContentHashOutput> {
    const head = this.shards[0];
    if (head === undefined) {
      throw new Error("ShardingCatalogPersistenceStrategy: no shards");
    }
    return head.computeSourceRowContentHash(input);
  }

  issueConnectionToken(input: IssueConnectionTokenInput): Promise<IssueConnectionTokenOutput> {
    const i = catalogShardIndexForTenant(input.principal_id, this.shards.length);
    const s = this.shards[i];
    if (s === undefined) {
      throw new Error("ShardingCatalogPersistenceStrategy: shard index out of range");
    }
    return s.issueConnectionToken(input);
  }
}
