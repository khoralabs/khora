import { randomBytes } from "node:crypto";
import type { Database, Statement } from "bun:sqlite";

import type { CatalogPersistenceStrategy } from "../catalog-persistence-strategy.ts";
import type {
  BatchLookupSourceMapPointersInput,
  BatchLookupSourceMapPointersOutput,
  ComputeSourceRowContentHashInput,
  ComputeSourceRowContentHashOutput,
  FanOutTarget,
  IssueConnectionTokenInput,
  IssueConnectionTokenOutput,
  LookupSourceMapPointerInput,
  LookupSourceMapPointerOutput,
  PointerRef,
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
} from "../colonnade-types.ts";
import {
  canonicalSourceMapRowBytes,
  sha256HexLower,
} from "../hash.ts";
import { poolShardCellId, perPrincipalCellId } from "./principal-cell-id.ts";
import { ensureCatalogSchema } from "./schema-catalog.ts";
import { applySqlitePerfPragmas } from "./sqlite-pragmas.ts";

const ZERO_HASH = "0".repeat(64);

const MISS_POINTER: PointerRef = {
  source_cell_id: "_",
  source_record_key: "_",
  content_hash: ZERO_HASH,
};

export class SqliteCatalogPersistenceStrategy implements CatalogPersistenceStrategy {
  private readonly stmtSelectHomeCell: Statement;
  private readonly stmtSelectRrSeq: Statement;
  private readonly stmtInsertHomeCell: Statement;
  private readonly stmtUpdateRrSeq: Statement;
  private readonly stmtInsertHomeCellIgnore: Statement;
  private readonly stmtSelectDiscoveryRevision: Statement;
  private readonly stmtUpsertDiscovery: Statement;
  private readonly stmtUpsertPredicate: Statement;
  private readonly stmtDeletePredicate: Statement;
  private readonly stmtUpsertCatalogPointer: Statement;
  private readonly stmtResolveCatalogPointer: Statement;
  private readonly stmtUpsertSourceMapRow: Statement;
  private readonly stmtSelectDiscoveryBody: Statement;
  private readonly stmtLookupSourceMapRow: Statement;
  private readonly stmtInsertConnectionToken: Statement;
  private readonly batchLookupBySize = new Map<number, Statement>();

  constructor(private readonly db: Database) {
    ensureCatalogSchema(db);
    applySqlitePerfPragmas(db);
    this.db.run(`INSERT OR IGNORE INTO catalog_meta(key, value) VALUES ('rr_seq', '0')`);

    this.stmtSelectHomeCell = db.prepare("SELECT cell_id FROM principal_home_cell WHERE principal_id = ?");
    this.stmtSelectRrSeq = db.prepare("SELECT value FROM catalog_meta WHERE key = 'rr_seq'");
    this.stmtInsertHomeCell = db.prepare(
      "INSERT INTO principal_home_cell(principal_id, cell_id) VALUES (?, ?)",
    );
    this.stmtUpdateRrSeq = db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'rr_seq'");
    this.stmtInsertHomeCellIgnore = db.prepare(
      "INSERT OR IGNORE INTO principal_home_cell(principal_id, cell_id) VALUES (?, ?)",
    );
    this.stmtSelectDiscoveryRevision = db.prepare(
      "SELECT revision FROM discovery_documents WHERE document_key = ?",
    );
    this.stmtUpsertDiscovery = db.prepare(
      `INSERT INTO discovery_documents(document_key, body, revision) VALUES (?, ?, ?)
       ON CONFLICT(document_key) DO UPDATE SET body = excluded.body, revision = excluded.revision`,
    );
    this.stmtUpsertPredicate = db.prepare(
      `INSERT OR REPLACE INTO predicates(predicate_id, definition) VALUES (?, ?)`,
    );
    this.stmtDeletePredicate = db.prepare(`DELETE FROM predicates WHERE predicate_id = ?`);
    this.stmtUpsertCatalogPointer = db.prepare(
      `INSERT OR REPLACE INTO catalog_pointers(catalog_pointer_id, locator_cell_id, locator_record_key, content_hash, projection)
       VALUES (?, ?, ?, ?, ?)`,
    );
    this.stmtResolveCatalogPointer = db.prepare(
      `SELECT locator_cell_id, locator_record_key, content_hash FROM catalog_pointers WHERE catalog_pointer_id = ?`,
    );
    this.stmtUpsertSourceMapRow = db.prepare(
      `INSERT INTO source_map_rows(tenant_key, source_map_id, entry_key, pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, projection, source_row_content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_key, source_map_id, entry_key) DO UPDATE SET
         pointer_source_cell_id = excluded.pointer_source_cell_id,
         pointer_source_record_key = excluded.pointer_source_record_key,
         pointer_content_hash = excluded.pointer_content_hash,
         projection = excluded.projection,
         source_row_content_hash = excluded.source_row_content_hash`,
    );
    this.stmtSelectDiscoveryBody = db.prepare(
      "SELECT body FROM discovery_documents WHERE document_key = ?",
    );
    this.stmtLookupSourceMapRow = db.prepare(
      `SELECT pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, projection, source_row_content_hash
       FROM source_map_rows WHERE tenant_key = ? AND source_map_id = ? AND entry_key = ?`,
    );
    this.stmtInsertConnectionToken = db.prepare(
      `INSERT INTO connection_tokens(token, principal_id, intended_audience, expires_at_ms) VALUES (?, ?, ?, ?)`,
    );
  }

  private batchLookupStmt(n: number): Statement {
    let s = this.batchLookupBySize.get(n);
    if (s === undefined) {
      const placeholders = Array.from({ length: n }, () => "?").join(",");
      s = this.db.prepare(
        `SELECT entry_key, pointer_source_cell_id, pointer_source_record_key, pointer_content_hash, projection, source_row_content_hash
         FROM source_map_rows WHERE tenant_key = ? AND source_map_id = ? AND entry_key IN (${placeholders})`,
      );
      this.batchLookupBySize.set(n, s);
    }
    return s;
  }

  /** Pool mode: persisted round-robin assignment into `principal_home_cell`. */
  assignPrincipalToCellPool(principalId: string, cellCount: number): string {
    if (cellCount < 1) {
      throw new Error("SqliteCatalogPersistenceStrategy: cellCount must be >= 1");
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.stmtSelectHomeCell.get(principalId) as { cell_id: string } | null | undefined;
      if (existing != null) {
        this.db.exec("COMMIT");
        return existing.cell_id;
      }

    const metaRow = this.stmtSelectRrSeq.get() as { value: string } | null | undefined;
      const seq = Number.parseInt(metaRow?.value ?? "0", 10) || 0;
      const idx = seq % cellCount;
      const cellId = poolShardCellId(idx);
      this.stmtInsertHomeCell.run(principalId, cellId);
      this.stmtUpdateRrSeq.run(String(seq + 1));
      this.db.exec("COMMIT");
      return cellId;
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore double-rollback */
      }
      throw e;
    }
  }

  /** Per-principal isolation: deterministic cell id + mapping row. */
  assignPrincipalToCellDedicated(principalId: string): string {
    const cellId = perPrincipalCellId(principalId);
    this.stmtInsertHomeCellIgnore.run(principalId, cellId);
    return cellId;
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

  registerPercolationPredicate(
    input: RegisterPercolationPredicateInput,
  ): Promise<RegisterPercolationPredicateOutput> {
    this.stmtUpsertPredicate.run(
      input.predicate.predicate_id,
      JSON.stringify({
        predicate_id: input.predicate.predicate_id,
        definition: input.predicate.definition,
      }),
    );
    return Promise.resolve({ registered: true });
  }

  revokePercolationPredicate(
    input: RevokePercolationPredicateInput,
  ): Promise<RevokePercolationPredicateOutput> {
    const r = this.stmtDeletePredicate.run(input.predicate_id);
    return Promise.resolve({ revoked: r.changes > 0 });
  }

  upsertCatalogPointer(input: UpsertCatalogPointerInput): Promise<UpsertCatalogPointerOutput> {
    this.stmtUpsertCatalogPointer.run(
      input.catalog_pointer_id,
      input.locator.cell_id,
      input.locator.record_key,
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
          content_hash: string;
        }
      | null
      | undefined;
    if (row == null) {
      throw new Error(`SqliteCatalogPersistenceStrategy: unknown catalog_pointer_id ${input.catalog_pointer_id}`);
    }
    return Promise.resolve({
      locator: {
        cell_id: row.locator_cell_id,
        record_key: row.locator_record_key,
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
      JSON.stringify(input.projection),
      source_row_content_hash,
    );
    return Promise.resolve({ source_row_content_hash });
  }

  resolvePostFanOutTargets(
    input: ResolvePostFanOutTargetsInput,
  ): Promise<ResolvePostFanOutTargetsOutput> {
    const docKey = `colonnade:fanout:${input.tenant_key}:${input.content_hash}`;
    const row = this.stmtSelectDiscoveryBody.get(docKey) as { body: string } | null | undefined;
    if (row == null) {
      return Promise.resolve({ fan_out_targets: [] });
    }
    let body: unknown;
    try {
      body = JSON.parse(row.body) as unknown;
    } catch {
      return Promise.resolve({ fan_out_targets: [] });
    }
    const raw = (body as { fan_out_targets?: unknown }).fan_out_targets;
    if (!Array.isArray(raw)) {
      return Promise.resolve({ fan_out_targets: [] });
    }
    const fan_out_targets: FanOutTarget[] = [];
    for (const item of raw) {
      if (
        item !== null &&
        typeof item === "object" &&
        "recipient_cell_id" in item &&
        "recipient_principal_id" in item
      ) {
        const o = item as Record<string, unknown>;
        fan_out_targets.push({
          recipient_cell_id: String(o.recipient_cell_id),
          recipient_principal_id: String(o.recipient_principal_id),
        });
      }
    }
    return Promise.resolve({ fan_out_targets });
  }

  lookupSourceMapPointer(input: LookupSourceMapPointerInput): Promise<LookupSourceMapPointerOutput> {
    const row = this.stmtLookupSourceMapRow.get(
      input.tenant_key,
      input.source_map_id,
      input.entry_key,
    ) as
      | {
          pointer_source_cell_id: string;
          pointer_source_record_key: string;
          pointer_content_hash: string;
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
    this.stmtInsertConnectionToken.run(token, input.principal_id, input.intended_audience, expires_at_ms);
    return Promise.resolve({ token, expires_at_ms });
  }
}
