import type { Database } from "bun:sqlite";
import type { PrincipalId } from "@khoralabs/host-runtime";

export type PrincipalTeardownJobState = "pending" | "running" | "completed" | "failed";

/** Ensures durable teardown job metadata table on relay catalog SQLite. */
export function ensurePrincipalTeardownJobsSchema(db: Database): void {
  db.exec(`
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
  `);
}

export function insertPendingPrincipalTeardownJob(
  db: Database,
  input: { did: string; profileId: string; nowMs: number },
): void {
  db.prepare(
    `
    INSERT INTO principal_teardown_jobs (
      did, profile_id, state, enqueued_at_ms, updated_at_ms, attempt_count, last_error
    ) VALUES (?, ?, 'pending', ?, ?, 0, NULL)
  `,
  ).run(input.did, input.profileId, input.nowMs, input.nowMs);
}

/** Pending or running job — author is staged for teardown and inbox pointers must not resolve. */
export function principalHasActiveTeardownJob(db: Database, did: PrincipalId): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM principal_teardown_jobs WHERE did = ? AND state IN ('pending', 'running')`,
    )
    .get(did) as { ok: number } | null | undefined;
  return row != null;
}

export function deletePrincipalTeardownJob(db: Database, did: PrincipalId): void {
  db.prepare(`DELETE FROM principal_teardown_jobs WHERE did = ?`).run(did);
}

export type ClaimedPrincipalTeardownJob = { did: string; profileId: string };

/** Single-connection claim; returns undefined if no pending job or lost a race. */
export function tryClaimNextPendingPrincipalTeardownJob(
  db: Database,
  nowMs: number,
): ClaimedPrincipalTeardownJob | undefined {
  const row = db
    .prepare(
      `SELECT did, profile_id AS profileId FROM principal_teardown_jobs
       WHERE state = 'pending' ORDER BY enqueued_at_ms ASC LIMIT 1`,
    )
    .get() as { did: string; profileId: string } | null | undefined;
  if (row == null) {
    return undefined;
  }
  const info = db
    .prepare(
      `UPDATE principal_teardown_jobs
       SET state = 'running', updated_at_ms = ?, attempt_count = attempt_count + 1
       WHERE did = ? AND state = 'pending'`,
    )
    .run(nowMs, row.did);
  if (info.changes === 0) {
    return undefined;
  }
  return row;
}

export function markPrincipalTeardownJobPendingAfterFailure(
  db: Database,
  did: PrincipalId,
  nowMs: number,
  lastError: string,
): void {
  db.prepare(
    `UPDATE principal_teardown_jobs
     SET state = 'pending', updated_at_ms = ?, last_error = ?
     WHERE did = ?`,
  ).run(nowMs, lastError, did);
}
