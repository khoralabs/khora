import { isFilterOnlyMode, type PercolatorPersistence, type StandingQuery } from "..";
import { execSql, queryAll, queryOne, type TursoClients } from "./client";
import {
  encodeVector,
  FILTER_COLS,
  type QueryRow,
  rowToFilterQuery,
  rowToSemanticQuery,
  SEMANTIC_COLS,
  type SemanticQueryRow,
  searchToJson,
} from "./row-map";
import { ensurePercolatorSchemaTurso } from "./schema";

export async function createPercolatorTursoPersistence(
  db: TursoClients,
): Promise<PercolatorPersistence> {
  await ensurePercolatorSchemaTurso(db);

  return {
    async upsertQuery(query: StandingQuery): Promise<void> {
      if (isFilterOnlyMode(query.search)) {
        await execSql(db.write, `DELETE FROM percolator_semantic_queries WHERE id = ?`, [query.id]);
        await execSql(
          db.write,
          `INSERT INTO percolator_filter_queries (${FILTER_COLS})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             owner_id = excluded.owner_id,
             search_json = excluded.search_json,
             min_score = excluded.min_score,
             active = excluded.active,
             updated_at_ms = excluded.updated_at_ms,
             expires_at_ms = excluded.expires_at_ms`,
          [
            query.id,
            query.ownerId,
            searchToJson(query),
            query.minScore,
            query.active ? 1 : 0,
            query.createdAtMs,
            query.updatedAtMs,
            query.expiresAtMs ?? null,
          ],
        );
      } else {
        await execSql(db.write, `DELETE FROM percolator_filter_queries WHERE id = ?`, [query.id]);
        const vec = query.search.content.vector;
        await execSql(
          db.write,
          `INSERT INTO percolator_semantic_queries (${SEMANTIC_COLS})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             owner_id = excluded.owner_id,
             search_json = excluded.search_json,
             vector = excluded.vector,
             min_score = excluded.min_score,
             active = excluded.active,
             updated_at_ms = excluded.updated_at_ms,
             expires_at_ms = excluded.expires_at_ms`,
          [
            query.id,
            query.ownerId,
            searchToJson(query),
            vec !== undefined && vec.length > 0 ? encodeVector(vec) : null,
            query.minScore,
            query.active ? 1 : 0,
            query.createdAtMs,
            query.updatedAtMs,
            query.expiresAtMs ?? null,
          ],
        );
      }
    },

    async deactivateQuery(queryId: string, now: number): Promise<void> {
      await execSql(
        db.write,
        `UPDATE percolator_filter_queries SET active = 0, updated_at_ms = ? WHERE id = ?`,
        [now, queryId],
      );
      await execSql(
        db.write,
        `UPDATE percolator_semantic_queries SET active = 0, updated_at_ms = ? WHERE id = ?`,
        [now, queryId],
      );
    },

    async deleteQuery(queryId: string): Promise<void> {
      await execSql(db.write, `DELETE FROM percolator_filter_queries WHERE id = ?`, [queryId]);
      await execSql(db.write, `DELETE FROM percolator_semantic_queries WHERE id = ?`, [queryId]);
    },

    async getQuery(queryId: string): Promise<StandingQuery | undefined> {
      const filterRow = await queryOne<QueryRow>(
        db.read,
        `SELECT ${FILTER_COLS} FROM percolator_filter_queries WHERE id = ?`,
        [queryId],
      );
      if (filterRow !== undefined) return rowToFilterQuery(filterRow);
      const semanticRow = await queryOne<SemanticQueryRow>(
        db.read,
        `SELECT ${SEMANTIC_COLS} FROM percolator_semantic_queries WHERE id = ?`,
        [queryId],
      );
      if (semanticRow !== undefined) return rowToSemanticQuery(semanticRow);
      return undefined;
    },

    async listQueriesByOwner(ownerId: string): Promise<StandingQuery[]> {
      const filterRows = (
        await queryAll<QueryRow>(
          db.read,
          `SELECT ${FILTER_COLS} FROM percolator_filter_queries WHERE owner_id = ? ORDER BY created_at_ms ASC`,
          [ownerId],
        )
      ).map(rowToFilterQuery);
      const semanticRows = (
        await queryAll<SemanticQueryRow>(
          db.read,
          `SELECT ${SEMANTIC_COLS} FROM percolator_semantic_queries WHERE owner_id = ? ORDER BY created_at_ms ASC`,
          [ownerId],
        )
      ).map(rowToSemanticQuery);
      return [...filterRows, ...semanticRows].sort((a, b) => a.createdAtMs - b.createdAtMs);
    },

    async listActiveFilterQueries(now: number): Promise<StandingQuery[]> {
      const rows = await queryAll<QueryRow>(
        db.read,
        `SELECT ${FILTER_COLS} FROM percolator_filter_queries
         WHERE active = 1 AND (expires_at_ms IS NULL OR expires_at_ms > ?)
         ORDER BY created_at_ms ASC`,
        [now],
      );
      return rows.map(rowToFilterQuery);
    },

    async listActiveSemanticQueries(now: number): Promise<StandingQuery[]> {
      const rows = await queryAll<SemanticQueryRow>(
        db.read,
        `SELECT ${SEMANTIC_COLS} FROM percolator_semantic_queries
         WHERE active = 1 AND (expires_at_ms IS NULL OR expires_at_ms > ?)
         ORDER BY created_at_ms ASC`,
        [now],
      );
      return rows.map(rowToSemanticQuery);
    },
  };
}
