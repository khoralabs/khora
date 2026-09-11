import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  createPendingEmbeddingQueue,
  ensurePendingEmbeddingsSchema,
} from "./pending-embeddings-queue";

describe("pending embeddings sqlite queue", () => {
  test("enqueue, listDue, complete, markAttemptFailed, purge, reset, summary", () => {
    const db = new Database(":memory:");
    const queue = createPendingEmbeddingQueue(db);

    queue.enqueue({
      namespace: "ns",
      memoryKey: "m1",
      sourceKey: "body",
      text: "hello",
    });
    queue.enqueue({
      namespace: "ns",
      memoryKey: "empty",
      sourceKey: "body",
      text: "   ",
    });

    const due = queue.listDue({ maxAttempts: 5, nowSec: Math.floor(Date.now() / 1000), limit: 10 });
    expect(due).toHaveLength(1);
    const first = due[0];
    expect(first?.memoryKey).toBe("m1");
    if (first === undefined) throw new Error("expected due row");

    queue.markAttemptFailed(first.id, Math.floor(Date.now() / 1000));
    expect(queue.summary({ maxAttempts: 1 }).failed).toBe(1);
    expect(queue.resetFailed(1)).toBe(1);

    queue.enqueue({
      namespace: "ns",
      memoryKey: "blank",
      sourceKey: "body",
      text: "x",
    });
    db.query("UPDATE pending_embeddings SET text = '  ' WHERE memory_key = 'blank'").run();
    expect(queue.purgeEmpty()).toBeGreaterThanOrEqual(1);

    queue.enqueue({
      namespace: "ns",
      memoryKey: "m2",
      sourceKey: "body",
      text: "again",
    });
    const again = queue.listDue({
      maxAttempts: 5,
      nowSec: Math.floor(Date.now() / 1000),
      limit: 10,
    });
    expect(again.some((r) => r.memoryKey === "m2")).toBe(true);
    const m2 = again.find((r) => r.memoryKey === "m2");
    if (m2 === undefined) throw new Error("expected m2 row");
    queue.complete(m2.id);
    expect(queue.summary().pending).toBe(1);
  });

  test("migrates legacy table without source_key", () => {
    const db = new Database(":memory:");
    db.run(`
      CREATE TABLE pending_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        namespace TEXT NOT NULL,
        memory_key TEXT NOT NULL,
        text TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(namespace, memory_key)
      );
    `);
    db.query(`INSERT INTO pending_embeddings (namespace, memory_key, text) VALUES (?, ?, ?)`).run(
      "global/agents/alice",
      "profile",
      "legacy row",
    );

    ensurePendingEmbeddingsSchema(db);
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(pending_embeddings)")
      .all()
      .map((c) => c.name);
    expect(cols).toContain("source_key");

    const queue = createPendingEmbeddingQueue(db);
    const summary = queue.summary();
    expect(summary.pending).toBe(1);
    expect(summary.rows[0]?.sourceKey).toBe("body");
    expect(summary.rows[0]?.memoryKey).toBe("profile");
  });
});
