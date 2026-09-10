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

type PointerRow = {
  catalog_pointer_id: string;
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

export type TursoCatalogPersistenceOptions = {
  readonly shardIndex?: number;
  readonly autoMigrate?: boolean;
};

export class TursoCatalogPersistence implements CatalogPersistence {
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
  ): Promise<TursoCatalogPersistence> {
    if (opts.autoMigrate !== false) {
      await migrateCatalogTursoServerless(db);
    }
    const si = opts.shardIndex ?? 0;
    if (!Number.isInteger(si) || si < 0 || si > 65535) {
      throw new Error(`TursoCatalogPersistence: shardIndex must be 0..65535, got ${si}`);
    }
    return new TursoCatalogPersistence(db, si);
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
    const prev = await queryOne<{ catalog_pointer_id: string }>(
      this.db.write,
      `SELECT catalog_pointer_id FROM catalog_pointers WHERE tenant_key = ? AND publication_key = ?`,
      [input.tenant_key, input.publication_key],
    );
    if (prev !== undefined && prev.catalog_pointer_id !== input.catalog_pointer_id) {
      await execSql(
        this.db.write,
        `DELETE FROM catalog_pointer_tags WHERE catalog_pointer_id = ?`,
        [prev.catalog_pointer_id],
      );
      await execSql(this.db.write, `DELETE FROM catalog_pointers WHERE catalog_pointer_id = ?`, [
        prev.catalog_pointer_id,
      ]);
    }
    await execSql(
      this.db.write,
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
      [
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
      ],
    );
    await execSql(this.db.write, `DELETE FROM catalog_pointer_tags WHERE catalog_pointer_id = ?`, [
      input.catalog_pointer_id,
    ]);
    for (const tag of input.tags) {
      await execSql(
        this.db.write,
        `INSERT OR REPLACE INTO catalog_pointer_tags(tenant_key, tag, published_at_ms, catalog_pointer_id)
         VALUES (?, ?, ?, ?)`,
        [input.tenant_key, tag, input.published_at_ms, input.catalog_pointer_id],
      );
    }
    return {};
  }

  async resolveCatalogPointer(
    input: ResolveCatalogPointerInput,
  ): Promise<ResolveCatalogPointerOutput> {
    const row = await queryOne<{
      tenant_key: string;
      locator_cell_id: string;
      locator_record_key: string;
      locator_cell_pool_count: number;
      content_hash: string;
    }>(
      this.db.read,
      `SELECT tenant_key, locator_cell_id, locator_record_key, locator_cell_pool_count, content_hash
       FROM catalog_pointers WHERE catalog_pointer_id = ?`,
      [input.catalog_pointer_id],
    );
    if (row === undefined) {
      throw new Error(
        `TursoCatalogPersistence: unknown catalog_pointer_id ${input.catalog_pointer_id}`,
      );
    }
    return {
      locator: {
        cell_id: row.locator_cell_id,
        record_key: row.locator_record_key,
        cell_pool_count: row.locator_cell_pool_count,
      },
      content_hash: row.content_hash,
      cell: { cell_id: row.locator_cell_id, tenant_key: row.tenant_key },
    };
  }

  async deletePublicationPointer(
    input: DeletePublicationPointerInput,
  ): Promise<DeletePublicationPointerOutput> {
    const prev = await queryOne<{ catalog_pointer_id: string }>(
      this.db.write,
      `SELECT catalog_pointer_id FROM catalog_pointers WHERE tenant_key = ? AND publication_key = ?`,
      [input.tenant_key, input.publication_key],
    );
    if (prev === undefined) return { deleted: false };
    await execSql(this.db.write, `DELETE FROM catalog_pointer_tags WHERE catalog_pointer_id = ?`, [
      prev.catalog_pointer_id,
    ]);
    await execSql(
      this.db.write,
      `DELETE FROM catalog_pointers WHERE tenant_key = ? AND publication_key = ?`,
      [input.tenant_key, input.publication_key],
    );
    return { deleted: true };
  }

  async deletePublicationPointersByPublisher(
    input: DeletePublicationPointersByPublisherInput,
  ): Promise<DeletePublicationPointersByPublisherOutput> {
    const ids = await queryAll<{ catalog_pointer_id: string }>(
      this.db.write,
      `SELECT catalog_pointer_id FROM catalog_pointers
       WHERE tenant_key = ? AND publisher_principal_id = ?`,
      [input.tenant_key, input.publisher_principal_id],
    );
    for (const row of ids) {
      await execSql(
        this.db.write,
        `DELETE FROM catalog_pointer_tags WHERE catalog_pointer_id = ?`,
        [row.catalog_pointer_id],
      );
      await execSql(this.db.write, `DELETE FROM catalog_pointers WHERE catalog_pointer_id = ?`, [
        row.catalog_pointer_id,
      ]);
    }
    return { deleted_count: ids.length };
  }

  async listPublicationPointers(
    input: ListPublicationPointersInput,
  ): Promise<ListPublicationPointersOutput> {
    const tags = input.tags_all ?? [];
    const cursor =
      input.cursor !== undefined && input.cursor.length > 0
        ? decodePublicationFeedCursor(input.cursor)
        : undefined;
    const params: unknown[] = [input.tenant_key];
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

    const rows = await queryAll<PointerRow>(this.db.read, sql, params);
    const tagsById = await this.loadTagsByPointerIds(
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
    return {
      entries,
      next_cursor:
        entries.length === limit && last !== undefined
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
    const params: unknown[] = [input.tenant_key, input.after_ms];
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
    const row = await queryOne<{ c: number }>(this.db.read, sql, params);
    return { count: Number(row?.c ?? 0) };
  }

  private async loadTagsByPointerIds(
    tenantKey: string,
    pointerIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (pointerIds.length === 0) return out;
    const placeholders = Array.from({ length: pointerIds.length }, () => "?").join(",");
    const rows = await queryAll<{ catalog_pointer_id: string; tag: string }>(
      this.db.read,
      `SELECT catalog_pointer_id, tag FROM catalog_pointer_tags
       WHERE tenant_key = ? AND catalog_pointer_id IN (${placeholders})`,
      [tenantKey, ...pointerIds],
    );
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
    return {
      found: true,
      pointer: {
        source_cell_id: row.pointer_source_cell_id,
        source_record_key: row.pointer_source_record_key,
        content_hash: row.pointer_content_hash,
        cell_pool_count: row.pointer_cell_pool_count,
      },
      source_row_content_hash: row.source_row_content_hash,
      projection: parseProjection(row.projection),
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
