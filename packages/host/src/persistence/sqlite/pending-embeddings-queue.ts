import type { Database } from "bun:sqlite";
import type {
  PendingEmbeddingDueRow,
  PendingEmbeddingEnqueueInput,
  PendingEmbeddingQueuePort,
  PendingEmbeddingQueueSummary,
} from "../core/port";
import { PENDING_EMBEDDINGS_DDL } from "../core/schema/pending-embeddings-ddl";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_SOURCE_KEY = "body";

type PendingEmbeddingRow = {
  id: number;
  namespace: string;
  memory_key: string;
  source_key: string;
  text: string;
  attempts: number;
  last_attempt_at: number | null;
  created_at: number;
};

function migratePendingEmbeddingsTable(db: Database): void {
  const cols = db.query<{ name: string }, []>("PRAGMA table_info(pending_embeddings)").all();
  if (cols.length === 0) return;
  if (cols.some((c) => c.name === "source_key")) return;

  db.run("BEGIN");
  try {
    db.run(`
      CREATE TABLE pending_embeddings_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        namespace TEXT NOT NULL,
        memory_key TEXT NOT NULL,
        source_key TEXT NOT NULL DEFAULT 'body',
        text TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(namespace, memory_key, source_key)
      );
    `);
    db.run(`
      INSERT INTO pending_embeddings_migrated (
        id, namespace, memory_key, source_key, text, attempts, last_attempt_at, created_at
      )
      SELECT id, namespace, memory_key, 'body', text, attempts, last_attempt_at, created_at
      FROM pending_embeddings;
    `);
    db.run("DROP TABLE pending_embeddings");
    db.run("ALTER TABLE pending_embeddings_migrated RENAME TO pending_embeddings");
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
}

export function ensurePendingEmbeddingsSchema(db: Database): void {
  db.run(PENDING_EMBEDDINGS_DDL);
  migratePendingEmbeddingsTable(db);
}

function mapDueRow(row: PendingEmbeddingRow): PendingEmbeddingDueRow {
  return {
    id: row.id,
    namespace: row.namespace,
    memoryKey: row.memory_key,
    sourceKey: row.source_key,
    text: row.text,
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at ?? null,
    createdAt: row.created_at,
  };
}

export function createPendingEmbeddingQueue(db: Database): PendingEmbeddingQueuePort {
  ensurePendingEmbeddingsSchema(db);

  return {
    enqueue(input: PendingEmbeddingEnqueueInput): void {
      if (input.text.trim().length === 0) return;
      const sourceKey = input.sourceKey.trim().length > 0 ? input.sourceKey : DEFAULT_SOURCE_KEY;
      db.query(
        `
          INSERT INTO pending_embeddings (namespace, memory_key, source_key, text, attempts, last_attempt_at)
          VALUES (?, ?, ?, ?, 0, NULL)
          ON CONFLICT(namespace, memory_key, source_key) DO UPDATE SET
            text=excluded.text,
            attempts=0,
            last_attempt_at=NULL
        `,
      ).run(input.namespace, input.memoryKey, sourceKey, input.text);
    },

    listDue(opts): PendingEmbeddingDueRow[] {
      return db
        .query<PendingEmbeddingRow, [number, number, number]>(
          `
            SELECT id, namespace, memory_key, source_key, text, attempts, last_attempt_at, created_at
            FROM pending_embeddings
            WHERE attempts < ?
              AND (last_attempt_at IS NULL OR last_attempt_at <= ?)
            ORDER BY created_at ASC
            LIMIT ?
          `,
        )
        .all(opts.maxAttempts, opts.nowSec, opts.limit)
        .map(mapDueRow);
    },

    complete(id: number): void {
      db.query("DELETE FROM pending_embeddings WHERE id = ?").run(id);
    },

    markAttemptFailed(id: number, nowSec: number): void {
      db.query(
        `
          UPDATE pending_embeddings
          SET attempts = attempts + 1,
              last_attempt_at = ?
          WHERE id = ?
        `,
      ).run(nowSec, id);
    },

    purgeEmpty(): number {
      return db.query("DELETE FROM pending_embeddings WHERE trim(text) = ''").run().changes;
    },

    resetFailed(maxAttempts: number): number {
      return db
        .query(
          `
            UPDATE pending_embeddings
            SET attempts = 0, last_attempt_at = NULL
            WHERE attempts >= ?
          `,
        )
        .run(maxAttempts).changes;
    },

    summary(opts): PendingEmbeddingQueueSummary {
      const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
      const limit = opts?.limit ?? 25;
      const pendingRow = db
        .query<{ count: number }, [number]>(
          "SELECT COUNT(*) AS count FROM pending_embeddings WHERE attempts < ?",
        )
        .get(maxAttempts);
      const failedRow = db
        .query<{ count: number }, [number]>(
          "SELECT COUNT(*) AS count FROM pending_embeddings WHERE attempts >= ?",
        )
        .get(maxAttempts);
      const rows = db
        .query<
          {
            id: number;
            namespace: string;
            memory_key: string;
            source_key: string;
            attempts: number;
            last_attempt_at: number | null;
            created_at: number;
          },
          [number]
        >(
          `
            SELECT id, namespace, memory_key, source_key, attempts, last_attempt_at, created_at
            FROM pending_embeddings
            ORDER BY attempts DESC, created_at ASC
            LIMIT ?
          `,
        )
        .all(limit)
        .map((row) => ({
          id: row.id,
          namespace: row.namespace,
          memoryKey: row.memory_key,
          sourceKey: row.source_key,
          attempts: row.attempts,
          lastAttemptAt: row.last_attempt_at ?? null,
          createdAt: row.created_at,
        }));
      return {
        pending: pendingRow?.count ?? 0,
        failed: failedRow?.count ?? 0,
        rows,
      };
    },
  };
}
