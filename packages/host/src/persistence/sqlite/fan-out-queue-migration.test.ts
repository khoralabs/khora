import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createSqliteFanOutQueue } from "./fan-out-queue";

test("migrates legacy ordinal JSON workload chunks", () => {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE fan_out_jobs (
      id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, post_id TEXT NOT NULL,
      source_cell_id TEXT NOT NULL, source_record_key TEXT NOT NULL,
      source_content_hash TEXT NOT NULL, cell_pool_count INTEGER NOT NULL,
      author_principal_id TEXT NOT NULL, post_kind TEXT NOT NULL,
      post_metadata_json TEXT NOT NULL, visibility TEXT NOT NULL, status TEXT NOT NULL,
      planned_target_count INTEGER NOT NULL DEFAULT 0,
      routed_target_count INTEGER NOT NULL DEFAULT 0, attempt_count INTEGER NOT NULL DEFAULT 0,
      available_at_ms INTEGER NOT NULL, lease_expires_at_ms INTEGER, last_error TEXT,
      created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
      UNIQUE (tenant_key, post_id)
    );
    CREATE TABLE fan_out_workload_chunks (
      job_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      recipient_ordinals_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY (job_id, chunk_index)
    );
    INSERT INTO fan_out_workload_chunks VALUES ('job', 0, '[2,7]', 'pending', 1);
  `);

  const queue = createSqliteFanOutQueue(db);
  expect(queue.listWorkloadChunks("job")[0]?.records).toEqual([
    { ordinal: 2, subscriptionMatches: [] },
    { ordinal: 7, subscriptionMatches: [] },
  ]);
});
