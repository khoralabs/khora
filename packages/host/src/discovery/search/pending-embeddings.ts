import type { Database } from "bun:sqlite";
import type { MemoriesClientAsync } from "@khoralabs/memories-node";
import { type EmbeddingModel, embedTextChunks } from "@khoralabs/memories-node/helpers";
import type { khoraOntology } from "./ontology";

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BACKOFF_BASE_MS = 15_000;
const DEFAULT_SOURCE_KEY = "body";

export type PendingEmbeddingQueueHandle = { stop(): void };

export type PendingEmbeddingQueueSummaryRow = {
  id: number;
  namespace: string;
  memoryKey: string;
  sourceKey: string;
  attempts: number;
  lastAttemptAt: number | null;
  createdAt: number;
};

export type PendingEmbeddingQueueSummary = {
  pending: number;
  failed: number;
  rows: PendingEmbeddingQueueSummaryRow[];
};

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

export type RunPendingEmbeddingRetryBatchResult = {
  picked: number;
  attempted: number;
  succeeded: number;
  failed: number;
  removedMissing: number;
  removedEmpty: number;
};

type PendingEmbeddingClient = MemoriesClientAsync<
  typeof khoraOntology.nodeLabels,
  typeof khoraOntology.edgeLabels
>;

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

export function ensurePendingEmbeddingsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_embeddings (
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
  migratePendingEmbeddingsTable(db);
}

export function purgeEmptyPendingEmbeddings(db: Database): number {
  ensurePendingEmbeddingsTable(db);
  const result = db.query("DELETE FROM pending_embeddings WHERE trim(text) = ''").run();
  return result.changes;
}

export function resetFailedPendingEmbeddings(db: Database, maxAttempts?: number): number {
  ensurePendingEmbeddingsTable(db);
  const limit = maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const result = db
    .query(
      `
        UPDATE pending_embeddings
        SET attempts = 0, last_attempt_at = NULL
        WHERE attempts >= ?
      `,
    )
    .run(limit);
  return result.changes;
}

export function enqueuePendingEmbedding(
  db: Database,
  input: { namespace: string; memoryKey: string; sourceKey: string; text: string },
): void {
  if (input.text.trim().length === 0) return;
  ensurePendingEmbeddingsTable(db);
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
}

export function readPendingEmbeddingQueueSummary(
  db: Database,
  opts?: { maxAttempts?: number; limit?: number },
): PendingEmbeddingQueueSummary {
  ensurePendingEmbeddingsTable(db);
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
    .query<PendingEmbeddingRow, [number]>(
      `
        SELECT id, namespace, memory_key, source_key, text, attempts, last_attempt_at, created_at
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
}

export async function runPendingEmbeddingRetryBatch(opts: {
  db: Database;
  client: PendingEmbeddingClient;
  embeddingModel?: EmbeddingModel;
  batchSize?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  ignoreBackoff?: boolean;
  logError?: (message: string, err: unknown) => void;
}): Promise<RunPendingEmbeddingRetryBatchResult> {
  ensurePendingEmbeddingsTable(opts.db);
  if (opts.embeddingModel === undefined) {
    return { picked: 0, attempted: 0, succeeded: 0, failed: 0, removedMissing: 0, removedEmpty: 0 };
  }
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const ignoreBackoff = opts.ignoreBackoff ?? false;
  const logError =
    opts.logError ?? ((message: string, err: unknown) => console.error(message, err));

  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const rows = opts.db
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
    .all(maxAttempts, nowSec, batchSize);

  const result: RunPendingEmbeddingRetryBatchResult = {
    picked: rows.length,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    removedMissing: 0,
    removedEmpty: 0,
  };

  for (const row of rows) {
    if (row.text.trim().length === 0) {
      opts.db.query("DELETE FROM pending_embeddings WHERE id = ?").run(row.id);
      result.removedEmpty += 1;
      continue;
    }
    const lastAttemptMs = row.last_attempt_at !== null ? row.last_attempt_at * 1000 : undefined;
    const waitMs = backoffBaseMs * 2 ** row.attempts;
    if (!ignoreBackoff && lastAttemptMs !== undefined && nowMs - lastAttemptMs < waitMs) continue;

    const memoryId = await opts.client.persistence.findMemoryIdByKey(row.namespace, row.memory_key);
    if (memoryId === undefined) {
      opts.db.query("DELETE FROM pending_embeddings WHERE id = ?").run(row.id);
      result.removedMissing += 1;
      continue;
    }
    result.attempted += 1;

    try {
      const vectors = await embedTextChunks(opts.embeddingModel, [row.text]);
      const vector = vectors[0];
      if (!vector || vector.length === 0) {
        throw new Error("empty vector");
      }
      await opts.client.replaceMemoryFeature({
        namespace: row.namespace,
        key: row.memory_key,
        sourceKey: row.source_key,
        vector,
      });
      opts.db.query("DELETE FROM pending_embeddings WHERE id = ?").run(row.id);
      result.succeeded += 1;
    } catch (err) {
      opts.db
        .query(
          `
            UPDATE pending_embeddings
            SET attempts = attempts + 1,
                last_attempt_at = ?
            WHERE id = ?
          `,
        )
        .run(Math.floor(Date.now() / 1000), row.id);
      result.failed += 1;
      logError("[khora-memories] retry embedding failed", err);
    }
  }

  return result;
}

export function startEmbeddingRetryWorker(opts: {
  db: Database;
  client: PendingEmbeddingClient;
  embeddingModel?: EmbeddingModel;
  intervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  logError?: (message: string, err: unknown) => void;
}): PendingEmbeddingQueueHandle {
  ensurePendingEmbeddingsTable(opts.db);
  if (opts.embeddingModel === undefined) {
    return { stop() {} };
  }
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const logError =
    opts.logError ?? ((message: string, err: unknown) => console.error(message, err));
  let stopped = false;
  let running = false;

  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await runPendingEmbeddingRetryBatch({
        db: opts.db,
        client: opts.client,
        embeddingModel: opts.embeddingModel,
        batchSize,
        maxAttempts,
        backoffBaseMs,
        logError,
      });
    } finally {
      running = false;
    }
  };

  const id = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();
  return {
    stop(): void {
      stopped = true;
      clearInterval(id);
    },
  };
}
