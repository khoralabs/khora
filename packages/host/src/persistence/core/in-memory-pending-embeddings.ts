import type {
  PendingEmbeddingDueRow,
  PendingEmbeddingEnqueueInput,
  PendingEmbeddingQueuePort,
  PendingEmbeddingQueueSummary,
} from "./port";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_SOURCE_KEY = "body";

type StoredRow = {
  id: number;
  namespace: string;
  memoryKey: string;
  sourceKey: string;
  text: string;
  attempts: number;
  lastAttemptAt: number | null;
  createdAt: number;
};

export function createInMemoryPendingEmbeddingQueue(): PendingEmbeddingQueuePort {
  const rows = new Map<string, StoredRow>();
  let nextId = 1;

  function keyOf(namespace: string, memoryKey: string, sourceKey: string): string {
    return `${namespace}\0${memoryKey}\0${sourceKey}`;
  }

  return {
    enqueue(input: PendingEmbeddingEnqueueInput): void {
      if (input.text.trim().length === 0) return;
      const sourceKey = input.sourceKey.trim().length > 0 ? input.sourceKey : DEFAULT_SOURCE_KEY;
      const key = keyOf(input.namespace, input.memoryKey, sourceKey);
      const existing = rows.get(key);
      if (existing !== undefined) {
        existing.text = input.text;
        existing.attempts = 0;
        existing.lastAttemptAt = null;
        return;
      }
      const nowSec = Math.floor(Date.now() / 1000);
      rows.set(key, {
        id: nextId++,
        namespace: input.namespace,
        memoryKey: input.memoryKey,
        sourceKey,
        text: input.text,
        attempts: 0,
        lastAttemptAt: null,
        createdAt: nowSec,
      });
    },

    listDue(opts): PendingEmbeddingDueRow[] {
      return [...rows.values()]
        .filter(
          (r) =>
            r.attempts < opts.maxAttempts &&
            (r.lastAttemptAt === null || r.lastAttemptAt <= opts.nowSec),
        )
        .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
        .slice(0, opts.limit)
        .map((r) => ({ ...r }));
    },

    complete(id: number): void {
      for (const [key, row] of rows) {
        if (row.id === id) {
          rows.delete(key);
          return;
        }
      }
    },

    markAttemptFailed(id: number, nowSec: number): void {
      for (const row of rows.values()) {
        if (row.id === id) {
          row.attempts += 1;
          row.lastAttemptAt = nowSec;
          return;
        }
      }
    },

    purgeEmpty(): number {
      let n = 0;
      for (const [key, row] of rows) {
        if (row.text.trim().length === 0) {
          rows.delete(key);
          n += 1;
        }
      }
      return n;
    },

    resetFailed(maxAttempts: number): number {
      let n = 0;
      for (const row of rows.values()) {
        if (row.attempts >= maxAttempts) {
          row.attempts = 0;
          row.lastAttemptAt = null;
          n += 1;
        }
      }
      return n;
    },

    summary(opts): PendingEmbeddingQueueSummary {
      const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
      const limit = opts?.limit ?? 25;
      const all = [...rows.values()];
      const pending = all.filter((r) => r.attempts < maxAttempts).length;
      const failed = all.filter((r) => r.attempts >= maxAttempts).length;
      const summaryRows = [...all]
        .sort((a, b) => b.attempts - a.attempts || a.createdAt - b.createdAt)
        .slice(0, limit)
        .map((r) => ({
          id: r.id,
          namespace: r.namespace,
          memoryKey: r.memoryKey,
          sourceKey: r.sourceKey,
          attempts: r.attempts,
          lastAttemptAt: r.lastAttemptAt,
          createdAt: r.createdAt,
        }));
      return { pending, failed, rows: summaryRows };
    },
  };
}
