import type { MemoriesClientAsync } from "@khoralabs/memories-node";
import { type EmbeddingModel, embedTextChunks } from "@khoralabs/memories-node/helpers";
import type { PendingEmbeddingQueuePort } from "../../persistence/core/port";
import type { khoraOntology } from "./ontology";

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BACKOFF_BASE_MS = 15_000;

export type PendingEmbeddingQueueHandle = { stop(): void };

export type {
  PendingEmbeddingQueueSummary,
  PendingEmbeddingQueueSummaryRow,
} from "../../persistence/core/port";

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

export async function runPendingEmbeddingRetryBatch(opts: {
  queue: PendingEmbeddingQueuePort;
  client: PendingEmbeddingClient;
  embeddingModel?: EmbeddingModel;
  batchSize?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  ignoreBackoff?: boolean;
  logError?: (message: string, err: unknown) => void;
}): Promise<RunPendingEmbeddingRetryBatchResult> {
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
  const rows = opts.queue.listDue({ maxAttempts, nowSec, limit: batchSize });

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
      opts.queue.complete(row.id);
      result.removedEmpty += 1;
      continue;
    }
    const lastAttemptMs = row.lastAttemptAt !== null ? row.lastAttemptAt * 1000 : undefined;
    const waitMs = backoffBaseMs * 2 ** row.attempts;
    if (!ignoreBackoff && lastAttemptMs !== undefined && nowMs - lastAttemptMs < waitMs) continue;

    const memoryId = await opts.client.persistence.findMemoryIdByKey(row.namespace, row.memoryKey);
    if (memoryId === undefined) {
      opts.queue.complete(row.id);
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
        key: row.memoryKey,
        sourceKey: row.sourceKey,
        vector,
      });
      opts.queue.complete(row.id);
      result.succeeded += 1;
    } catch (err) {
      opts.queue.markAttemptFailed(row.id, Math.floor(Date.now() / 1000));
      result.failed += 1;
      logError("[khora-memories] retry embedding failed", err);
    }
  }

  return result;
}

export function startEmbeddingRetryWorker(opts: {
  queue: PendingEmbeddingQueuePort;
  client: PendingEmbeddingClient;
  embeddingModel?: EmbeddingModel;
  intervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  logError?: (message: string, err: unknown) => void;
}): PendingEmbeddingQueueHandle {
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
        queue: opts.queue,
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
