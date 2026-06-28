import { randomBytes } from "node:crypto";

import type {
  BatchLookupSourceMapPointersInput,
  BatchLookupSourceMapPointersOutput,
  CatalogPersistenceStrategy,
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
} from "@khoralabs/colonnade-persistence";
import {
  canonicalSourceMapRowBytes,
  encodeCatalogPointerId,
  sha256HexLower,
} from "@khoralabs/colonnade-persistence";
import type { TursoClients } from "./client";
import { execSql, queryAll, queryOne } from "./client";
import { migrateCatalogTursoServerless } from "./migrations/catalog-migrations";
import { runSerializedTursoTransaction } from "./turso-immediate-txn";

const ZERO_HASH = "0".repeat(64);

const MISS_POINTER: PointerRef = {
  source_cell_id: "_",
  source_record_key: "_",
  content_hash: ZERO_HASH,
  cell_pool_count: 1,
};

export type TursoCatalogPersistenceOptions = {
  readonly shardIndex?: number;
  readonly autoMigrate?: boolean;
};

export class TursoCatalogPersistenceStrategy implements CatalogPersistenceStrategy {
  private readonly shardIndex: number;

  private constructor(
    private readonly db: TursoClients,
    shardIndex: number,
  ) {
    this.shardIndex = shardIndex;
  }

  static async open(
    db: TursoClients,
    opts: TursoCatalogPersistenceOptions = {},
  ): Promise<TursoCatalogPersistenceStrategy> {
    if (opts.autoMigrate !== false) {
      await migrateCatalogTursoServerless(db);
    }
    const si = opts.shardIndex ?? 0;
    if (!Number.isInteger(si) || si < 0 || si > 65535) {
      throw new Error(`TursoCatalogPersistenceStrategy: shardIndex must be 0..65535, got ${si}`);
    }
    return new TursoCatalogPersistenceStrategy(db, si);
  }

  nextCatalogPointerId(_tenantKey: string): string {
    void _tenantKey;
    return encodeCatalogPointerId(this.shardIndex);
  }

  runImmediateTransactionForTenant<T>(_tenantKey: string, fn: () => Promise<T>): Promise<T> {
    void _tenantKey;
    return runSerializedTursoTransaction(this.db, fn);
  }

  async upsertDiscoveryDocument(
    input: UpsertDiscoveryDocumentInput,
  ): Promise<UpsertDiscoveryDocumentOutput> {
    const prev = await queryOne<{ revision: number }>(
      this.db.read,
      "SELECT revision FROM discovery_documents WHERE document_key = ?",
      [input.document_key],
    );
    const revision = (prev?.revision ?? 0) + 1;
    const body = JSON.stringify(input.body);
    await execSql(
      this.db.write,
      `INSERT INTO discovery_documents(document_key, body, revision) VALUES (?, ?, ?)
       ON CONFLICT(document_key) DO UPDATE SET body = excluded.body, revision = excluded.revision`,
      [input.document_key, body, revision],
    );
    return { revision_token: String(revision) };
  }

  async upsertCatalogPointer(
    input: UpsertCatalogPointerInput,
  ): Promise<UpsertCatalogPointerOutput> {
    await execSql(
      this.db.write,
      `INSERT OR REPLACE INTO catalog_pointers(catalog_pointer_id, locator_cell_id, locator_record_key, locator_cell_pool_count, content_hash, projection)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.catalog_pointer_id,
        input.locator.cell_id,
        input.locator.record_key,
        input.locator.cell_pool_count,
        input.content_hash,
        JSON.stringify(input.public_projection),
      ],
    );
    return {};
  }

  async resolveCatalogPointer(
    input: ResolveCatalogPointerInput,
  ): Promise<ResolveCatalogPointerOutput> {
    const row = await queryOne<{
      locator_cell_id: string;
      locator_record_key: string;
      locator_cell_pool_count: number;
      content_hash: string;
    }>(
      this.db.read,
      `SELECT locator_cell_id, locator_record_key, locator_cell_pool_count, content_hash FROM catalog_pointers WHERE catalog_pointer_id = ?`,
      [input.catalog_pointer_id],
    );
    if (row === undefined) {
      throw new Error(
        `TursoCatalogPersistenceStrategy: unknown catalog_pointer_id ${input.catalog_pointer_id}`,
      );
    }
    return {
      locator: {
        cell_id: row.locator_cell_id,
        record_key: row.locator_record_key,
        cell_pool_count: row.locator_cell_pool_count,
      },
      content_hash: row.content_hash,
      cell: { cell_id: row.locator_cell_id, tenant_key: "" },
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
    await execSql(
      this.db.write,
      `INSERT INTO source_map_rows(tenant_key, source_map_id, entry_key, pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, pointer_cell_pool_count, projection, source_row_content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_key, source_map_id, entry_key) DO UPDATE SET
         pointer_source_cell_id = excluded.pointer_source_cell_id,
         pointer_source_record_key = excluded.pointer_source_record_key,
         pointer_content_hash = excluded.pointer_content_hash,
         pointer_cell_pool_count = excluded.pointer_cell_pool_count,
         projection = excluded.projection,
         source_row_content_hash = excluded.source_row_content_hash`,
      [
        input.tenant_key,
        input.source_map_id,
        input.entry_key,
        input.pointer.source_cell_id,
        input.pointer.source_record_key,
        input.pointer.content_hash,
        input.pointer.cell_pool_count,
        JSON.stringify(input.projection),
        source_row_content_hash,
      ],
    );
    return { source_row_content_hash };
  }

  async lookupSourceMapPointer(
    input: LookupSourceMapPointerInput,
  ): Promise<LookupSourceMapPointerOutput> {
    const row = await queryOne<{
      pointer_source_cell_id: string;
      pointer_source_record_key: string;
      pointer_content_hash: string;
      pointer_cell_pool_count: number;
      projection: string;
      source_row_content_hash: string;
    }>(
      this.db.read,
      `SELECT pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, pointer_cell_pool_count, projection, source_row_content_hash
       FROM source_map_rows WHERE tenant_key = ? AND source_map_id = ? AND entry_key = ?`,
      [input.tenant_key, input.source_map_id, input.entry_key],
    );
    if (row === undefined) {
      return {
        found: false,
        pointer: { ...MISS_POINTER },
        source_row_content_hash: ZERO_HASH,
        projection: {},
      };
    }
    let projection: unknown = {};
    try {
      projection = JSON.parse(row.projection) as unknown;
    } catch {
      projection = {};
    }
    return {
      found: true,
      pointer: {
        source_cell_id: row.pointer_source_cell_id,
        source_record_key: row.pointer_source_record_key,
        content_hash: row.pointer_content_hash,
        cell_pool_count: row.pointer_cell_pool_count,
      },
      source_row_content_hash: row.source_row_content_hash,
      projection,
    };
  }

  async batchLookupSourceMapPointers(
    input: BatchLookupSourceMapPointersInput,
  ): Promise<BatchLookupSourceMapPointersOutput> {
    if (input.entry_keys.length === 0) {
      return { hits: [] };
    }
    const placeholders = Array.from({ length: input.entry_keys.length }, () => "?").join(",");
    const rows = await queryAll<{
      entry_key: string;
      pointer_source_cell_id: string;
      pointer_source_record_key: string;
      pointer_content_hash: string;
      pointer_cell_pool_count: number;
      projection: string;
      source_row_content_hash: string;
    }>(
      this.db.read,
      `SELECT entry_key, pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, pointer_cell_pool_count, projection, source_row_content_hash
         FROM source_map_rows WHERE tenant_key = ? AND source_map_id = ? AND entry_key IN (${placeholders})`,
      [input.tenant_key, input.source_map_id, ...input.entry_keys],
    );
    const hits = rows.map((row) => {
      let projection: unknown = {};
      try {
        projection = JSON.parse(row.projection) as unknown;
      } catch {
        projection = {};
      }
      return {
        entry_key: row.entry_key,
        pointer: {
          source_cell_id: row.pointer_source_cell_id,
          source_record_key: row.pointer_source_record_key,
          content_hash: row.pointer_content_hash,
          cell_pool_count: row.pointer_cell_pool_count,
        },
        source_row_content_hash: row.source_row_content_hash,
        projection,
      };
    });
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
    const token = `tok_${randomBytes(24).toString("hex")}`;
    const expires_at_ms = Date.now() + input.ttl_seconds * 1000;
    await execSql(
      this.db.write,
      `INSERT INTO connection_tokens(token, principal_id, intended_audience, expires_at_ms) VALUES (?, ?, ?, ?)`,
      [token, input.principal_id, input.intended_audience, expires_at_ms],
    );
    return { token, expires_at_ms };
  }

  async close(): Promise<void> {
    await this.db.read.close();
    await this.db.write.close();
  }
}
