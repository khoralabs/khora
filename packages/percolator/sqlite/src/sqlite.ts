import type { Database } from "bun:sqlite";
import {
  type PercolatorPersistence,
  type StandingQuery,
  zStandingSearchRequest,
} from "@khoralabs/percolator";
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

function rowToQuery(row: QueryRow): StandingQuery {
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

export function createPercolatorSqlitePersistence(db: Database): PercolatorPersistence {
  ensurePercolatorSchema(db);

  const upsertStmt = db.prepare(`
    INSERT INTO standing_queries (
      id, owner_id, search_json, min_score, active, created_at_ms, updated_at_ms, expires_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      search_json = excluded.search_json,
      min_score = excluded.min_score,
      active = excluded.active,
      updated_at_ms = excluded.updated_at_ms,
      expires_at_ms = excluded.expires_at_ms
  `);

  const deactivateStmt = db.prepare(`
    UPDATE standing_queries SET active = 0, updated_at_ms = ? WHERE id = ?
  `);

  const deleteQueryStmt = db.prepare(`DELETE FROM standing_queries WHERE id = ?`);

  const getQueryStmt = db.query<QueryRow, [string]>(
    `SELECT id, owner_id, search_json, min_score, active, created_at_ms, updated_at_ms, expires_at_ms
     FROM standing_queries WHERE id = ?`,
  );

  const listByOwnerStmt = db.query<QueryRow, [string]>(
    `SELECT id, owner_id, search_json, min_score, active, created_at_ms, updated_at_ms, expires_at_ms
     FROM standing_queries WHERE owner_id = ? ORDER BY created_at_ms ASC`,
  );

  const listActiveStmt = db.query<QueryRow, [number]>(
    `SELECT id, owner_id, search_json, min_score, active, created_at_ms, updated_at_ms, expires_at_ms
     FROM standing_queries
     WHERE active = 1 AND (expires_at_ms IS NULL OR expires_at_ms > ?)
     ORDER BY created_at_ms ASC`,
  );

  return {
    upsertQuery(query: StandingQuery): void {
      upsertStmt.run(
        query.id,
        query.ownerId,
        JSON.stringify(query.search),
        query.minScore,
        query.active ? 1 : 0,
        query.createdAtMs,
        query.updatedAtMs,
        query.expiresAtMs ?? null,
      );
    },

    deactivateQuery(queryId: string, now: number): void {
      deactivateStmt.run(now, queryId);
    },

    deleteQuery(queryId: string): void {
      deleteQueryStmt.run(queryId);
    },

    getQuery(queryId: string): StandingQuery | undefined {
      const row = getQueryStmt.get(queryId);
      if (row === null || row === undefined) return undefined;
      return rowToQuery(row);
    },

    listQueriesByOwner(ownerId: string): StandingQuery[] {
      return listByOwnerStmt.all(ownerId).map(rowToQuery);
    },

    listActiveQueries(now: number): StandingQuery[] {
      return listActiveStmt.all(now).map(rowToQuery);
    },
  };
}
