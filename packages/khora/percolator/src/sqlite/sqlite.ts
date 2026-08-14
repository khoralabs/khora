import type { Database } from "bun:sqlite";
import {
  isFilterOnlyMode,
  type PercolatorPersistence,
  type StandingQuery,
  zStandingSearchRequest,
} from "..";
import { ensurePercolatorSchema } from "./schema";

type QueryRow = {
  id: string;
  owner_id: string;
  search_json: string;
  min_score: number;
  active: number;
  created_at_ms: number;
  updated_at_ms: number;
  expires_at_ms: number | null;
};

type SemanticQueryRow = QueryRow & { vector: Buffer | null };

function encodeVector(vec: readonly number[]): Uint8Array {
  const f32 = new Float32Array(vec);
  return new Uint8Array(f32.buffer);
}

function decodeVector(blob: Buffer): number[] {
  const f32 = new Float32Array(
    blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength),
  );
  return Array.from(f32);
}

function searchToJson(query: StandingQuery): string {
  const { vector: _vec, ...restContent } = query.search.content;
  return JSON.stringify({ ...query.search, content: restContent });
}

function rowToFilterQuery(row: QueryRow): StandingQuery {
  const search = zStandingSearchRequest.parse(JSON.parse(row.search_json));
  return {
    id: row.id,
    ownerId: row.owner_id,
    search,
    minScore: row.min_score,
    active: row.active !== 0,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
    ...(row.expires_at_ms !== null ? { expiresAtMs: row.expires_at_ms } : {}),
  };
}

function rowToSemanticQuery(row: SemanticQueryRow): StandingQuery {
  const search = zStandingSearchRequest.parse(JSON.parse(row.search_json));
  if (row.vector !== null && row.vector.byteLength > 0) {
    search.content.vector = decodeVector(row.vector);
  }
  return {
    id: row.id,
    ownerId: row.owner_id,
    search,
    minScore: row.min_score,
    active: row.active !== 0,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
    ...(row.expires_at_ms !== null ? { expiresAtMs: row.expires_at_ms } : {}),
  };
}

const FILTER_COLS =
  "id, owner_id, search_json, min_score, active, created_at_ms, updated_at_ms, expires_at_ms";
const SEMANTIC_COLS =
  "id, owner_id, search_json, vector, min_score, active, created_at_ms, updated_at_ms, expires_at_ms";

export function createPercolatorSqlitePersistence(db: Database): PercolatorPersistence {
  ensurePercolatorSchema(db);

  const upsertFilterStmt = db.prepare(`
    INSERT INTO percolator_filter_queries (${FILTER_COLS})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      search_json = excluded.search_json,
      min_score = excluded.min_score,
      active = excluded.active,
      updated_at_ms = excluded.updated_at_ms,
      expires_at_ms = excluded.expires_at_ms
  `);

  const upsertSemanticStmt = db.prepare(`
    INSERT INTO percolator_semantic_queries (${SEMANTIC_COLS})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      search_json = excluded.search_json,
      vector = excluded.vector,
      min_score = excluded.min_score,
      active = excluded.active,
      updated_at_ms = excluded.updated_at_ms,
      expires_at_ms = excluded.expires_at_ms
  `);

  const deleteFilterStmt = db.prepare(`DELETE FROM percolator_filter_queries WHERE id = ?`);
  const deleteSemanticStmt = db.prepare(`DELETE FROM percolator_semantic_queries WHERE id = ?`);

  const deactivateFilterStmt = db.prepare(
    `UPDATE percolator_filter_queries SET active = 0, updated_at_ms = ? WHERE id = ?`,
  );
  const deactivateSemanticStmt = db.prepare(
    `UPDATE percolator_semantic_queries SET active = 0, updated_at_ms = ? WHERE id = ?`,
  );

  const getFilterStmt = db.query<QueryRow, [string]>(
    `SELECT ${FILTER_COLS} FROM percolator_filter_queries WHERE id = ?`,
  );
  const getSemanticStmt = db.query<SemanticQueryRow, [string]>(
    `SELECT ${SEMANTIC_COLS} FROM percolator_semantic_queries WHERE id = ?`,
  );

  const listFilterByOwnerStmt = db.query<QueryRow, [string]>(
    `SELECT ${FILTER_COLS} FROM percolator_filter_queries WHERE owner_id = ? ORDER BY created_at_ms ASC`,
  );
  const listSemanticByOwnerStmt = db.query<SemanticQueryRow, [string]>(
    `SELECT ${SEMANTIC_COLS} FROM percolator_semantic_queries WHERE owner_id = ? ORDER BY created_at_ms ASC`,
  );

  const listActiveFilterStmt = db.query<QueryRow, [number]>(
    `SELECT ${FILTER_COLS} FROM percolator_filter_queries
     WHERE active = 1 AND (expires_at_ms IS NULL OR expires_at_ms > ?)
     ORDER BY created_at_ms ASC`,
  );
  const listActiveSemanticStmt = db.query<SemanticQueryRow, [number]>(
    `SELECT ${SEMANTIC_COLS} FROM percolator_semantic_queries
     WHERE active = 1 AND (expires_at_ms IS NULL OR expires_at_ms > ?)
     ORDER BY created_at_ms ASC`,
  );

  return {
    async upsertQuery(query: StandingQuery): Promise<void> {
      if (isFilterOnlyMode(query.search)) {
        deleteSemanticStmt.run(query.id);
        upsertFilterStmt.run(
          query.id,
          query.ownerId,
          searchToJson(query),
          query.minScore,
          query.active ? 1 : 0,
          query.createdAtMs,
          query.updatedAtMs,
          query.expiresAtMs ?? null,
        );
      } else {
        deleteFilterStmt.run(query.id);
        const vec = query.search.content.vector;
        upsertSemanticStmt.run(
          query.id,
          query.ownerId,
          searchToJson(query),
          vec !== undefined && vec.length > 0 ? encodeVector(vec) : null,
          query.minScore,
          query.active ? 1 : 0,
          query.createdAtMs,
          query.updatedAtMs,
          query.expiresAtMs ?? null,
        );
      }
    },

    async deactivateQuery(queryId: string, now: number): Promise<void> {
      deactivateFilterStmt.run(now, queryId);
      deactivateSemanticStmt.run(now, queryId);
    },

    async deleteQuery(queryId: string): Promise<void> {
      deleteFilterStmt.run(queryId);
      deleteSemanticStmt.run(queryId);
    },

    async getQuery(queryId: string): Promise<StandingQuery | undefined> {
      const filterRow = getFilterStmt.get(queryId);
      if (filterRow !== null && filterRow !== undefined) return rowToFilterQuery(filterRow);
      const semanticRow = getSemanticStmt.get(queryId);
      if (semanticRow !== null && semanticRow !== undefined) return rowToSemanticQuery(semanticRow);
      return undefined;
    },

    async listQueriesByOwner(ownerId: string): Promise<StandingQuery[]> {
      const filterRows = listFilterByOwnerStmt.all(ownerId).map(rowToFilterQuery);
      const semanticRows = listSemanticByOwnerStmt.all(ownerId).map(rowToSemanticQuery);
      return [...filterRows, ...semanticRows].sort((a, b) => a.createdAtMs - b.createdAtMs);
    },

    async listActiveFilterQueries(now: number): Promise<StandingQuery[]> {
      return listActiveFilterStmt.all(now).map(rowToFilterQuery);
    },

    async listActiveSemanticQueries(now: number): Promise<StandingQuery[]> {
      return listActiveSemanticStmt.all(now).map(rowToSemanticQuery);
    },
  };
}
