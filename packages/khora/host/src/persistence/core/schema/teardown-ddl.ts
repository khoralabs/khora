/** Shared DDL for durable principal teardown job queue. */
export const PRINCIPAL_TEARDOWN_JOBS_DDL = `
CREATE TABLE IF NOT EXISTS principal_teardown_jobs (
  did TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  state TEXT NOT NULL,
  enqueued_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_principal_teardown_jobs_pending
  ON principal_teardown_jobs (state, enqueued_at_ms)
  WHERE state = 'pending';
`.trim();
