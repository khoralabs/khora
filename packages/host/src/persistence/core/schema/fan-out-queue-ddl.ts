export const FAN_OUT_QUEUE_DDL = `
CREATE TABLE IF NOT EXISTS fan_out_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_key TEXT NOT NULL,
  post_id TEXT NOT NULL,
  source_cell_id TEXT NOT NULL,
  source_record_key TEXT NOT NULL,
  source_content_hash TEXT NOT NULL,
  cell_pool_count INTEGER NOT NULL,
  author_principal_id TEXT NOT NULL,
  post_kind TEXT NOT NULL,
  post_metadata_json TEXT NOT NULL,
  visibility TEXT NOT NULL,
  status TEXT NOT NULL,
  planned_target_count INTEGER NOT NULL DEFAULT 0,
  routed_target_count INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at_ms INTEGER NOT NULL,
  lease_expires_at_ms INTEGER,
  last_error TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE (tenant_key, post_id)
);
CREATE INDEX IF NOT EXISTS idx_fan_out_jobs_planning
  ON fan_out_jobs (status, available_at_ms, created_at_ms);
CREATE TABLE IF NOT EXISTS fan_out_workload_chunks (
  job_id TEXT NOT NULL REFERENCES fan_out_jobs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  workload_gzip BLOB NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at_ms INTEGER NOT NULL DEFAULT 0,
  lease_expires_at_ms INTEGER,
  delivered_ordinals_json TEXT NOT NULL DEFAULT '[]',
  failed_ordinals_json TEXT NOT NULL DEFAULT '[]',
  last_error TEXT,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (job_id, chunk_index)
);
`.trim();
