import type { Database } from "bun:sqlite";
import type { PrincipalId } from "@khoralabs/khora-contracts";
import type { PrincipalTeardownQueuePort } from "@khoralabs/khora-host";

export type ClaimedTeardownJob = { principalId: PrincipalId; profileId: string };

export function ensurePrincipalTeardownJobsSchema(db: Database): void {
  db.run(`
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

export function createPrincipalTeardownQueue(db: Database): PrincipalTeardownQueuePort {
  return {
    enqueue(principalId: PrincipalId, profileId: string, nowMs: number): void {
      db.prepare(
        `INSERT INTO principal_teardown_jobs
         (did, profile_id, state, enqueued_at_ms, updated_at_ms, attempt_count, last_error)
         VALUES (?, ?, 'pending', ?, ?, 0, NULL)`,
      ).run(principalId, profileId, nowMs, nowMs);
    },

    tryClaimNext(nowMs: number): ClaimedTeardownJob | undefined {
      const row = db
        .prepare(
          `SELECT did, profile_id AS profileId FROM principal_teardown_jobs
           WHERE state = 'pending' ORDER BY enqueued_at_ms ASC LIMIT 1`,
        )
        .get() as { did: string; profileId: string } | null | undefined;
      if (row == null) return undefined;
      const info = db
        .prepare(
          `UPDATE principal_teardown_jobs
           SET state = 'running', updated_at_ms = ?, attempt_count = attempt_count + 1
           WHERE did = ? AND state = 'pending'`,
        )
        .run(nowMs, row.did);
      if (info.changes === 0) return undefined;
      return { principalId: row.did as PrincipalId, profileId: row.profileId };
    },

    hasActiveJob(principalId: PrincipalId): boolean {
      const row = db
        .prepare(
          `SELECT 1 AS ok FROM principal_teardown_jobs
           WHERE did = ? AND state IN ('pending', 'running')`,
        )
        .get(principalId) as { ok: number } | null | undefined;
      return row != null;
    },

    complete(principalId: PrincipalId): void {
      db.prepare(`DELETE FROM principal_teardown_jobs WHERE did = ?`).run(principalId);
    },

    failAndRequeue(principalId: PrincipalId, nowMs: number, error: string): void {
      db.prepare(
        `UPDATE principal_teardown_jobs
         SET state = 'pending', updated_at_ms = ?, last_error = ?
         WHERE did = ?`,
      ).run(nowMs, error, principalId);
    },
  };
}
