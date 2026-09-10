import type { Database, Statement } from "bun:sqlite";
import { randomBytes } from "node:crypto";

import type {
  BatchLookupSourceMapPointersInput,
  BatchLookupSourceMapPointersOutput,
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
} from "../../core";
import { canonicalSourceMapRowBytes, encodeCatalogPointerId, sha256HexLower } from "../../core";
import type { CatalogPersistence } from "../core";
import {
  decodePublicationFeedCursor,
  encodePublicationFeedCursor,
} from "../core/publication-feed-query";
import { ensureCatalogSchema } from "./schema-catalog";
import { runSerializedSqliteImmediateTransaction } from "./sqlite-immediate-txn";
import { applySqlitePerfPragmas } from "./sqlite-pragmas";

const ZERO_HASH = "0".repeat(64);

const MISS_POINTER: PointerRef = {
  source_cell_id: "_",
  source_record_key: "_",
  content_hash: ZERO_HASH,
  cell_pool_count: 1,
};

type PointerRow = {
  catalog_pointer_id: string;
  tenant_key: string;
  publication_key: string;
  publisher_principal_id: string;
  published_at_ms: number;
  locator_cell_id: string;
  locator_record_key: string;
  locator_cell_pool_count: number;
  content_hash: string;
  projection: string;
};

function tagsAllIntersectSql(tags: readonly string[]): string {
  if (tags.length === 0) return "";
  const parts = tags.map(
    () => `SELECT catalog_pointer_id FROM catalog_pointer_tags WHERE tenant_key = ? AND tag = ?`,
  );
  return ` AND catalog_pointer_id IN (${parts.join(" INTERSECT ")})`;
}

function parseProjection(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

export type SqliteCatalogPersistenceOptions = {
  /** Catalog shard index encoded into **`nextCatalogPointerId`** (0..65535). */
  readonly shardIndex?: number;
};

export class SqliteCatalogPersistence implements CatalogPersistence {
  private readonly shardIndex: number;
  private readonly stmtSelectDiscoveryRevision: Statement;
  private readonly stmtUpsertDiscovery: Statement;
  private readonly stmtSelectPublicationPointerId: Statement;
  private readonly stmtDeletePointerById: Statement;
  private readonly stmtDeleteTagsByPointerId: Statement;
  private readonly stmtUpsertCatalogPointer: Statement;
  private readonly stmtInsertTag: Statement;
  private readonly stmtResolveCatalogPointer: Statement;
  private readonly stmtDeleteByPublication: Statement;
  private readonly stmtSelectIdsByPublisher: Statement;
  private readonly stmtSelectTagsForPointersPrefix: string;
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
      throw new Error(`SqliteCatalogPersistence: shardIndex must be 0..65535, got ${si}`);
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
    this.stmtSelectPublicationPointerId = db.prepare(
      `SELECT catalog_pointer_id FROM catalog_pointers WHERE tenant_key = ? AND publication_key = ?`,
    );
    this.stmtDeletePointerById = db.prepare(
      `DELETE FROM catalog_pointers WHERE catalog_pointer_id = ?`,
    );
    this.stmtDeleteTagsByPointerId = db.prepare(
      `DELETE FROM catalog_pointer_tags WHERE catalog_pointer_id = ?`,
    );
    this.stmtUpsertCatalogPointer = db.prepare(
      `INSERT INTO catalog_pointers(
         catalog_pointer_id, tenant_key, publication_key, publisher_principal_id, published_at_ms,
         locator_cell_id, locator_record_key, locator_cell_pool_count, content_hash, projection
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(catalog_pointer_id) DO UPDATE SET
         tenant_key = excluded.tenant_key,
         publication_key = excluded.publication_key,
         publisher_principal_id = excluded.publisher_principal_id,
         published_at_ms = excluded.published_at_ms,
         locator_cell_id = excluded.locator_cell_id,
         locator_record_key = excluded.locator_record_key,
         locator_cell_pool_count = excluded.locator_cell_pool_count,
         content_hash = excluded.content_hash,
         projection = excluded.projection`,
    );
    this.stmtInsertTag = db.prepare(
      `INSERT OR REPLACE INTO catalog_pointer_tags(tenant_key, tag, published_at_ms, catalog_pointer_id)
       VALUES (?, ?, ?, ?)`,
    );
    this.stmtResolveCatalogPointer = db.prepare(
      `SELECT tenant_key, locator_cell_id, locator_record_key, locator_cell_pool_count, content_hash
       FROM catalog_pointers WHERE catalog_pointer_id = ?`,
    );
    this.stmtDeleteByPublication = db.prepare(
      `DELETE FROM catalog_pointers WHERE tenant_key = ? AND publication_key = ?`,
    );
    this.stmtSelectIdsByPublisher = db.prepare(
      `SELECT catalog_pointer_id FROM catalog_pointers
       WHERE tenant_key = ? AND publisher_principal_id = ?`,
    );
    this.stmtSelectTagsForPointersPrefix = `SELECT catalog_pointer_id, tag FROM catalog_pointer_tags WHERE tenant_key = ? AND catalog_pointer_id IN (`;
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

  private loadTagsByPointerIds(
    tenantKey: string,
    pointerIds: readonly string[],
  ): Map<string, string[]> {
    const out = new Map<string, string[]>();
    if (pointerIds.length === 0) return out;
    const placeholders = Array.from({ length: pointerIds.length }, () => "?").join(",");
    const rows = this.db
      .prepare(`${this.stmtSelectTagsForPointersPrefix}${placeholders})`)
      .all(tenantKey, ...pointerIds) as { catalog_pointer_id: string; tag: string }[];
    for (const row of rows) {
      let list = out.get(row.catalog_pointer_id);
      if (list === undefined) {
        list = [];
        out.set(row.catalog_pointer_id, list);
      }
      list.push(row.tag);
    }
    return out;
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
    const prev = this.stmtSelectPublicationPointerId.get(input.tenant_key, input.publication_key) as
      | { catalog_pointer_id: string }
      | null
      | undefined;
    if (prev != null && prev.catalog_pointer_id !== input.catalog_pointer_id) {
      this.stmtDeleteTagsByPointerId.run(prev.catalog_pointer_id);
      this.stmtDeletePointerById.run(prev.catalog_pointer_id);
    }
    this.stmtUpsertCatalogPointer.run(
      input.catalog_pointer_id,
      input.tenant_key,
      input.publication_key,
      input.publisher_principal_id,
      input.published_at_ms,
      input.locator.cell_id,
      input.locator.record_key,
      input.locator.cell_pool_count,
      input.content_hash,
      JSON.stringify(input.public_projection),
    );
    this.stmtDeleteTagsByPointerId.run(input.catalog_pointer_id);
    for (const tag of input.tags) {
      this.stmtInsertTag.run(
        input.tenant_key,
        tag,
        input.published_at_ms,
        input.catalog_pointer_id,
      );
    }
    return Promise.resolve({});
  }

  resolveCatalogPointer(input: ResolveCatalogPointerInput): Promise<ResolveCatalogPointerOutput> {
    const row = this.stmtResolveCatalogPointer.get(input.catalog_pointer_id) as
      | {
          tenant_key: string;
          locator_cell_id: string;
          locator_record_key: string;
          locator_cell_pool_count: number;
          content_hash: string;
        }
      | null
      | undefined;
    if (row == null) {
      throw new Error(
        `SqliteCatalogPersistence: unknown catalog_pointer_id ${input.catalog_pointer_id}`,
      );
    }
    return Promise.resolve({
      locator: {
        cell_id: row.locator_cell_id,
        record_key: row.locator_record_key,
        cell_pool_count: row.locator_cell_pool_count,
      },
      content_hash: row.content_hash,
      cell: { cell_id: row.locator_cell_id, tenant_key: row.tenant_key },
    });
  }

  deletePublicationPointer(
    input: DeletePublicationPointerInput,
  ): Promise<DeletePublicationPointerOutput> {
    const prev = this.stmtSelectPublicationPointerId.get(input.tenant_key, input.publication_key) as
      | { catalog_pointer_id: string }
      | null
      | undefined;
    if (prev == null) return Promise.resolve({ deleted: false });
    this.stmtDeleteTagsByPointerId.run(prev.catalog_pointer_id);
    this.stmtDeleteByPublication.run(input.tenant_key, input.publication_key);
    return Promise.resolve({ deleted: true });
  }

  deletePublicationPointersByPublisher(
    input: DeletePublicationPointersByPublisherInput,
  ): Promise<DeletePublicationPointersByPublisherOutput> {
    const ids = this.stmtSelectIdsByPublisher.all(
      input.tenant_key,
      input.publisher_principal_id,
    ) as { catalog_pointer_id: string }[];
    for (const row of ids) {
      this.stmtDeleteTagsByPointerId.run(row.catalog_pointer_id);
      this.stmtDeletePointerById.run(row.catalog_pointer_id);
    }
    return Promise.resolve({ deleted_count: ids.length });
  }

  listPublicationPointers(
    input: ListPublicationPointersInput,
  ): Promise<ListPublicationPointersOutput> {
    const tags = input.tags_all ?? [];
    const cursor =
      input.cursor !== undefined && input.cursor.length > 0
        ? decodePublicationFeedCursor(input.cursor)
        : undefined;
    const params: Array<string | number> = [input.tenant_key];
    let sql = `SELECT catalog_pointer_id, publication_key, publisher_principal_id, published_at_ms,
                      locator_cell_id, locator_record_key, locator_cell_pool_count, content_hash, projection
               FROM catalog_pointers WHERE tenant_key = ?`;
    if (input.publisher_principal_id !== undefined) {
      sql += ` AND publisher_principal_id = ?`;
      params.push(input.publisher_principal_id);
    }
    sql += tagsAllIntersectSql(tags);
    for (const tag of tags) {
      params.push(input.tenant_key, tag);
    }
    if (cursor !== undefined) {
      sql += ` AND (published_at_ms < ? OR (published_at_ms = ? AND catalog_pointer_id < ?))`;
      params.push(cursor.ts, cursor.ts, cursor.id);
    }
    sql += ` ORDER BY published_at_ms DESC, catalog_pointer_id DESC LIMIT ?`;
    const limit = Math.max(0, Math.floor(input.limit));
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as PointerRow[];
    const tagsById = this.loadTagsByPointerIds(
      input.tenant_key,
      rows.map((r) => r.catalog_pointer_id),
    );
    const entries: PublicationPointerEntry[] = rows.map((row) => ({
      catalog_pointer_id: row.catalog_pointer_id,
      publication_key: row.publication_key,
      publisher_principal_id: row.publisher_principal_id,
      published_at_ms: row.published_at_ms,
      tags: tagsById.get(row.catalog_pointer_id) ?? [],
      locator: {
        cell_id: row.locator_cell_id,
        record_key: row.locator_record_key,
        cell_pool_count: row.locator_cell_pool_count,
      },
      content_hash: row.content_hash,
      public_projection: parseProjection(row.projection),
    }));
    const last = entries[entries.length - 1];
    return Promise.resolve({
      entries,
      next_cursor:
        entries.length === limit && last !== undefined
          ? encodePublicationFeedCursor({
              ts: last.published_at_ms,
              id: last.catalog_pointer_id,
            })
          : "",
    });
  }

  countPublicationPointersAfter(
    input: CountPublicationPointersAfterInput,
  ): Promise<CountPublicationPointersAfterOutput> {
    const tags = input.tags_all ?? [];
    const params: Array<string | number> = [input.tenant_key, input.after_ms];
    let sql = `SELECT COUNT(*) AS c FROM catalog_pointers
               WHERE tenant_key = ? AND published_at_ms > ?`;
    if (input.publisher_principal_id !== undefined) {
      sql += ` AND publisher_principal_id = ?`;
      params.push(input.publisher_principal_id);
    }
    sql += tagsAllIntersectSql(tags);
    for (const tag of tags) {
      params.push(input.tenant_key, tag);
    }
    const row = this.db.prepare(sql).get(...params) as { c: number };
    return Promise.resolve({ count: Number(row.c) });
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
    return Promise.resolve({
      found: true,
      pointer: {
        source_cell_id: row.pointer_source_cell_id,
        source_record_key: row.pointer_source_record_key,
        content_hash: row.pointer_content_hash,
        cell_pool_count: row.pointer_cell_pool_count,
      },
      source_row_content_hash: row.source_row_content_hash,
      projection: parseProjection(row.projection),
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
    const hits = rows.map((row) => ({
      entry_key: row.entry_key,
      pointer: {
        source_cell_id: row.pointer_source_cell_id,
        source_record_key: row.pointer_source_record_key,
        content_hash: row.pointer_content_hash,
        cell_pool_count: row.pointer_cell_pool_count,
      },
      source_row_content_hash: row.source_row_content_hash,
      projection: parseProjection(row.projection),
    }));
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
