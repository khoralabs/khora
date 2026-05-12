import type { Database } from "bun:sqlite";
import type {
  SwarmHostEntityKind,
  SwarmHostEntityPersistence,
  SwarmHostEntityRow,
  SwarmHostEntityUpsert,
  SwarmHostPostPersistence,
} from "@khoralabs/swarm-host";
import { migrateAtriumHostDb } from "./migrate-atrium-host-db.ts";
import { listPostRowsByAuthorProfileIdAndKind } from "./probe-posts-sqlite.ts";

export function createSwarmHostEntitySqlitePersistence(
  db: Database,
  kind: SwarmHostEntityKind,
): SwarmHostEntityPersistence {
  migrateAtriumHostDb(db);

  const upsertRow = db.prepare(
    `INSERT INTO host_entities (kind, id, memory_id, body_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(kind, id) DO UPDATE SET
       memory_id = excluded.memory_id,
       body_json = excluded.body_json,
       updated_at = excluded.updated_at`,
  );
  const selectById = db.query(
    `SELECT id, memory_id, body_json, updated_at FROM host_entities WHERE kind = ? AND id = ?`,
  );
  const deleteByIdStmt = db.prepare(`DELETE FROM host_entities WHERE kind = ? AND id = ?`);

  return {
    upsert(record: SwarmHostEntityUpsert): void {
      upsertRow.run(kind, record.id, record.memoryId ?? null, record.bodyJson, Date.now());
    },

    getById(id: string): SwarmHostEntityRow | undefined {
      const row = selectById.get(kind, id) as
        | {
            id: string;
            memory_id: string | null;
            body_json: string;
            updated_at: number;
          }
        | null
        | undefined;
      if (row == null) {
        return undefined;
      }
      return {
        id: row.id,
        memoryId: row.memory_id,
        bodyJson: row.body_json,
        updatedAtMs: row.updated_at,
      };
    },

    deleteById(id: string): void {
      deleteByIdStmt.run(kind, id);
    },
  };
}

export function createSwarmHostPostSqlitePersistence(db: Database): SwarmHostPostPersistence {
  const base = createSwarmHostEntitySqlitePersistence(db, "post");
  return {
    ...base,
    listRowsByAuthorProfileIdAndKind(params) {
      return listPostRowsByAuthorProfileIdAndKind(
        db,
        params.authorProfileId,
        params.kind,
        params.limit,
      );
    },
  };
}
