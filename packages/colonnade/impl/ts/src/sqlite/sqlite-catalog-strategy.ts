import type { Database, Statement } from "bun:sqlite";
import { randomBytes } from "node:crypto";

import type { CatalogPersistenceStrategy } from "../catalog-persistence-strategy.ts";
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
} from "../colonnade-types.ts";
import { canonicalSourceMapRowBytes, sha256HexLower } from "../hash.ts";
import { encodeCatalogPointerId } from "./catalog-pointer-id.ts";
import { ensureCatalogSchema } from "./schema-catalog.ts";
import { runSerializedSqliteImmediateTransaction } from "./sqlite-immediate-txn.ts";
import { applySqlitePerfPragmas } from "./sqlite-pragmas.ts";

const ZERO_HASH = "0".repeat(64);

const MISS_POINTER: PointerRef = {
  source_cell_id: "_",
  source_record_key: "_",
  content_hash: ZERO_HASH,
  cell_pool_count: 1,
};

export type SqliteCatalogPersistenceOptions = {
  /** Catalog shard index encoded into **`nextCatalogPointerId`** (0..65535). */
  readonly shardIndex?: number;
};

export class SqliteCatalogPersistenceStrategy implements CatalogPersistenceStrategy {
  private readonly shardIndex: number;
  private readonly stmtSelectDiscoveryRevision: Statement;
  private readonly stmtUpsertDiscovery: Statement;
  private readonly stmtUpsertCatalogPointer: Statement;
  private readonly stmtResolveCatalogPointer: Statement;
  private readonly stmtUpsertSourceMapRow: Statement;
  private readonly stmtLookupSourceMapRow: Statement;
  private readonly stmtInsertConnectionToken: Statement;
  private readonly batchLookupBySize = new Map<number, Statement>();

  constructor(
    private readonly db: Database,
    opts: SqliteCatalogPersistenceOptions = {},
  ) {
    const si = opts.shardIndex ?? 0;
    if (!Number.isInteger(si) || si < 0 || si > 65535) {
      throw new Error(`SqliteCatalogPersistenceStrategy: shardIndex must be 0..65535, got ${si}`);
    }
    this.shardIndex = si;
    ensureCatalogSchema(db);
    applySqlitePerfPragmas(db);

    this.stmtSelectDiscoveryRevision = db.prepare(
      "SELECT revision FROM discovery_documents WHERE document_key = ?",
    );
    this.stmtUpsertDiscovery = db.prepare(
      `INSERT INTO discovery_documents(document_key, body, revision) VALUES (?, ?, ?)
       ON CONFLICT(document_key) DO UPDATE SET body = excluded.body, revision = excluded.revision`,
    );
    this.stmtUpsertCatalogPointer = db.prepare(
      `INSERT OR REPLACE INTO catalog_pointers(catalog_pointer_id, locator_cell_id, locator_record_key, locator_cell_pool_count, content_hash, projection)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    this.stmtResolveCatalogPointer = db.prepare(
      `SELECT locator_cell_id, locator_record_key, locator_cell_pool_count, content_hash FROM catalog_pointers WHERE catalog_pointer_id = ?`,
    );
    this.stmtUpsertSourceMapRow = db.prepare(
      `INSERT INTO source_map_rows(tenant_key, source_map_id, entry_key, pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, pointer_cell_pool_count, projection, source_row_content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_key, source_map_id, entry_key) DO UPDATE SET
         pointer_source_cell_id = excluded.pointer_source_cell_id,
         pointer_source_record_key = excluded.pointer_source_record_key,
         pointer_content_hash = excluded.pointer_content_hash,
         pointer_cell_pool_count = excluded.pointer_cell_pool_count,
         projection = excluded.projection,
         source_row_content_hash = excluded.source_row_content_hash`,
    );
    this.stmtLookupSourceMapRow = db.prepare(
      `SELECT pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, pointer_cell_pool_count, projection, source_row_content_hash
       FROM source_map_rows WHERE tenant_key = ? AND source_map_id = ? AND entry_key = ?`,
    );
    this.stmtInsertConnectionToken = db.prepare(
      `INSERT INTO connection_tokens(token, principal_id, intended_audience, expires_at_ms) VALUES (?, ?, ?, ?)`,
    );
  }

  nextCatalogPointerId(_tenantKey: string): string {
    void _tenantKey;
    return encodeCatalogPointerId(this.shardIndex);
  }

  runImmediateTransactionForTenant<T>(_tenantKey: string, fn: () => Promise<T>): Promise<T> {
    void _tenantKey;
    return runSerializedSqliteImmediateTransaction(this.db, fn);
  }

  private batchLookupStmt(n: number): Statement {
    let s = this.batchLookupBySize.get(n);
    if (s === undefined) {
      const placeholders = Array.from({ length: n }, () => "?").join(",");
      s = this.db.prepare(
        `SELECT entry_key, pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, pointer_cell_pool_count, projection, source_row_content_hash
         FROM source_map_rows WHERE tenant_key = ? AND source_map_id = ? AND entry_key IN (${placeholders})`,
      );
      this.batchLookupBySize.set(n, s);
    }
    return s;
  }

  upsertDiscoveryDocument(
    input: UpsertDiscoveryDocumentInput,
  ): Promise<UpsertDiscoveryDocumentOutput> {
    const prev = this.stmtSelectDiscoveryRevision.get(input.document_key) as
      | { revision: number }
      | null
      | undefined;
    const revision = (prev?.revision ?? 0) + 1;
    const body = JSON.stringify(input.body);
    this.stmtUpsertDiscovery.run(input.document_key, body, revision);
    return Promise.resolve({ revision_token: String(revision) });
  }

  upsertCatalogPointer(input: UpsertCatalogPointerInput): Promise<UpsertCatalogPointerOutput> {
    this.stmtUpsertCatalogPointer.run(
      input.catalog_pointer_id,
      input.locator.cell_id,
      input.locator.record_key,
      input.locator.cell_pool_count,
      input.content_hash,
      JSON.stringify(input.public_projection),
    );
    return Promise.resolve({});
  }

  resolveCatalogPointer(input: ResolveCatalogPointerInput): Promise<ResolveCatalogPointerOutput> {
    const row = this.stmtResolveCatalogPointer.get(input.catalog_pointer_id) as
      | {
          locator_cell_id: string;
          locator_record_key: string;
          locator_cell_pool_count: number;
          content_hash: string;
        }
      | null
      | undefined;
    if (row == null) {
      throw new Error(
        `SqliteCatalogPersistenceStrategy: unknown catalog_pointer_id ${input.catalog_pointer_id}`,
      );
    }
    return Promise.resolve({
      locator: {
        cell_id: row.locator_cell_id,
        record_key: row.locator_record_key,
        cell_pool_count: row.locator_cell_pool_count,
      },
      content_hash: row.content_hash,
      cell: { cell_id: row.locator_cell_id, tenant_key: "" },
    });
  }

  upsertSourceMapPointerRow(
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
    this.stmtUpsertSourceMapRow.run(
      input.tenant_key,
      input.source_map_id,
      input.entry_key,
      input.pointer.source_cell_id,
      input.pointer.source_record_key,
      input.pointer.content_hash,
      input.pointer.cell_pool_count,
      JSON.stringify(input.projection),
      source_row_content_hash,
    );
    return Promise.resolve({ source_row_content_hash });
  }

  lookupSourceMapPointer(
    input: LookupSourceMapPointerInput,
  ): Promise<LookupSourceMapPointerOutput> {
    const row = this.stmtLookupSourceMapRow.get(
      input.tenant_key,
      input.source_map_id,
      input.entry_key,
    ) as
      | {
          pointer_source_cell_id: string;
          pointer_source_record_key: string;
          pointer_content_hash: string;
          pointer_cell_pool_count: number;
          projection: string;
          source_row_content_hash: string;
        }
      | null
      | undefined;
    if (row == null) {
      return Promise.resolve({
        found: false,
        pointer: { ...MISS_POINTER },
        source_row_content_hash: ZERO_HASH,
        projection: {},
      });
    }
    let projection: unknown = {};
    try {
      projection = JSON.parse(row.projection) as unknown;
    } catch {
      projection = {};
    }
    return Promise.resolve({
      found: true,
      pointer: {
        source_cell_id: row.pointer_source_cell_id,
        source_record_key: row.pointer_source_record_key,
        content_hash: row.pointer_content_hash,
        cell_pool_count: row.pointer_cell_pool_count,
      },
      source_row_content_hash: row.source_row_content_hash,
      projection,
    });
  }

  batchLookupSourceMapPointers(
    input: BatchLookupSourceMapPointersInput,
  ): Promise<BatchLookupSourceMapPointersOutput> {
    if (input.entry_keys.length === 0) {
      return Promise.resolve({ hits: [] });
    }
    const n = input.entry_keys.length;
    const stmt = this.batchLookupStmt(n);
    const rows = stmt.all(input.tenant_key, input.source_map_id, ...input.entry_keys) as {
      entry_key: string;
      pointer_source_cell_id: string;
      pointer_source_record_key: string;
      pointer_content_hash: string;
      pointer_cell_pool_count: number;
      projection: string;
      source_row_content_hash: string;
    }[];
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
    return Promise.resolve({ hits });
  }

  computeSourceRowContentHash(
    input: ComputeSourceRowContentHashInput,
  ): Promise<ComputeSourceRowContentHashOutput> {
    return Promise.resolve({ content_hash: sha256HexLower(input.canonical_row_bytes) });
  }

  issueConnectionToken(input: IssueConnectionTokenInput): Promise<IssueConnectionTokenOutput> {
    const token = `tok_${randomBytes(24).toString("hex")}`;
    const expires_at_ms = Date.now() + input.ttl_seconds * 1000;
    this.stmtInsertConnectionToken.run(
      token,
      input.principal_id,
      input.intended_audience,
      expires_at_ms,
    );
    return Promise.resolve({ token, expires_at_ms });
  }
}
