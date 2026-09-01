import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  agentScope,
  DEFAULT_HOST_SEARCH_NAMESPACE_ROOT,
  enqueuePendingEmbedding,
  ensurePendingEmbeddingsTable,
  khoraOntology,
  PROFILE_MEMORY_KEY,
  readPendingEmbeddingQueueSummary,
} from "@khoralabs/khora-host";
import { MemoriesClientAsync } from "@khoralabs/memories-node";
import {
  createMemoriesPersistenceAsync,
  ensureCustomSqliteForExtensions,
  memoriesSqliteVecAvailable,
  openMemoriesDatabase,
} from "@khoralabs/memories-node/sqlite";
import { KHORA_HOST_MEMORIES_DATABASE_ID } from "../services/memories";

function memoriesTest(name: string, fn: () => Promise<void>): void {
  test.skipIf(!memoriesSqliteVecAvailable())(name, fn);
}

describe("memories 0.8.0 schema migration", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "khora-memories-migrate-"));

  afterAll(() => {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  memoriesTest("reopens file-backed host DB and preserves indexed memories", async () => {
    ensureCustomSqliteForExtensions();
    const root = DEFAULT_HOST_SEARCH_NAMESPACE_ROOT;
    const profileId = "e4a2c87d-141d-4bc8-a347-337fca92e3ce";
    const ns = agentScope(root, profileId);
    const dbPath = path.join(dataDir, `${KHORA_HOST_MEMORIES_DATABASE_ID.kind}.sqlite`);

    {
      const memoriesDb = openMemoriesDatabase(dbPath);
      const persistence = createMemoriesPersistenceAsync(memoriesDb);
      const client = new MemoriesClientAsync(persistence, khoraOntology);
      await client.mergeMemory({
        namespace: ns,
        key: PROFILE_MEMORY_KEY,
        content: [{ key: "body", text: "CEO and Co-Founder of Khora Labs" }],
        labels: [{ kind: "khora_profile", props: { profileId, username: "zach" } }],
        edges: [],
      });
      const { hits } = await client.search({
        namespace: ns,
        content: { text: "Khora Labs" },
        options: { topK: 5 },
      });
      expect(hits.some((h) => h.memory.key === PROFILE_MEMORY_KEY)).toBe(true);
      memoriesDb.close();
    }

    {
      const memoriesDb = openMemoriesDatabase(dbPath);
      const persistence = createMemoriesPersistenceAsync(memoriesDb);
      const client = new MemoriesClientAsync(persistence, khoraOntology);
      const { hits } = await client.search({
        namespace: ns,
        content: { text: "Khora Labs" },
        options: { topK: 5 },
      });
      expect(hits.some((h) => h.memory.key === PROFILE_MEMORY_KEY)).toBe(true);
      memoriesDb.close();
    }
  });

  test("migrates legacy pending_embeddings table to source_key schema", () => {
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

    ensurePendingEmbeddingsTable(db);

    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(pending_embeddings)")
      .all()
      .map((c) => c.name);
    expect(cols).toContain("source_key");

    const summary = readPendingEmbeddingQueueSummary(db);
    expect(summary.pending).toBe(1);
    expect(summary.rows[0]?.sourceKey).toBe("body");
    expect(summary.rows[0]?.memoryKey).toBe("profile");

    enqueuePendingEmbedding(db, {
      namespace: "global/agents/alice/posts",
      memoryKey: "post-1",
      sourceKey: "query",
      text: "platform pilots",
    });
    enqueuePendingEmbedding(db, {
      namespace: "global/agents/alice/posts",
      memoryKey: "post-1",
      sourceKey: "body",
      text: "hello",
    });
    expect(readPendingEmbeddingQueueSummary(db).pending).toBe(3);
  });
});
