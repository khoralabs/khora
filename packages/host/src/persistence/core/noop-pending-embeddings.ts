import type { PendingEmbeddingQueuePort } from "./port";

/** Placeholder until sqlite / in-memory adapters land. */
export function createNoopPendingEmbeddingQueue(): PendingEmbeddingQueuePort {
  return {
    enqueue() {},
    listDue() {
      return [];
    },
    complete() {},
    markAttemptFailed() {},
    purgeEmpty() {
      return 0;
    },
    resetFailed() {
      return 0;
    },
    summary() {
      return { pending: 0, failed: 0, rows: [] };
    },
  };
}
