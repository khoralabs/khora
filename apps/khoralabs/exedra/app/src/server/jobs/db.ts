import type { Database } from "bun:sqlite";
import type {
  CreateJobInput,
  JobEvent,
  JobEventRecord,
  JobKind,
  JobRecord,
  JobStatus,
} from "@khoralabs/exedra-workflows-shared/jobs/jobs";
import { nanoid } from "nanoid";

import { notifyJobEvent } from "./notify.js";

type JobRow = {
  id: string;
  kind: string;
  status: string;
  payload: string | null;
  owner_user_id: string | null;
  task_run_id: string | null;
  result: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  error: string | null;
};

type JobEventRow = {
  seq: number;
  event: string;
  created_at_ms: number;
};

function parseJson<T>(raw: string | null): T | null {
  if (raw === null || raw.length === 0) return null;
  return JSON.parse(raw) as T;
}

function rowToJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    kind: row.kind as JobKind,
    status: row.status as JobStatus,
    payload: parseJson(row.payload),
    ownerUserId: row.owner_user_id,
    taskRunId: row.task_run_id,
    result: parseJson(row.result),
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
    error: row.error,
  };
}

export function createJob(db: Database, input: CreateJobInput): JobRecord {
  const now = Date.now();
  const id = input.id ?? nanoid();
  const status = input.status ?? "pending";
  db.run(
    `INSERT INTO jobs (id, kind, status, payload, owner_user_id, task_run_id, result, created_at_ms, updated_at_ms, error)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
    [id, input.kind, status, JSON.stringify(input.payload), input.ownerUserId, now, now],
  );
  const job = getJob(db, id);
  if (job === null) throw new Error("Failed to create job");
  return job;
}

export function getJob(db: Database, jobId: string): JobRecord | null {
  const row = db
    .query<JobRow, [string]>(
      `SELECT id, kind, status, payload, owner_user_id, task_run_id, result, created_at_ms, updated_at_ms, error
       FROM jobs WHERE id = ?`,
    )
    .get(jobId);
  return row === null ? null : rowToJob(row);
}

export function setJobStatus(
  db: Database,
  jobId: string,
  status: JobStatus,
  patch?: { error?: string | null; taskRunId?: string | null; result?: unknown | null },
): JobRecord | null {
  const now = Date.now();
  const current = getJob(db, jobId);
  if (current === null) return null;

  const error =
    patch?.error !== undefined ? patch.error : patch?.result !== undefined ? null : current.error;
  const taskRunId = patch?.taskRunId !== undefined ? patch.taskRunId : current.taskRunId;
  const result = patch?.result !== undefined ? patch.result : current.result;

  db.run(
    `UPDATE jobs SET status = ?, error = ?, task_run_id = ?, result = ?, updated_at_ms = ? WHERE id = ?`,
    [
      status,
      error,
      taskRunId,
      result === null || result === undefined ? null : JSON.stringify(result),
      now,
      jobId,
    ],
  );
  notifyJobEvent(jobId);
  return getJob(db, jobId);
}

export function appendJobEvents(
  db: Database,
  jobId: string,
  events: readonly JobEvent[],
): JobEventRecord[] {
  if (events.length === 0) return [];

  const now = Date.now();
  const inserted: JobEventRecord[] = [];

  db.run("BEGIN IMMEDIATE");
  try {
    const maxSeq =
      db
        .query<{ max_seq: number | null }, [string]>(
          `SELECT MAX(seq) AS max_seq FROM job_events WHERE job_id = ?`,
        )
        .get(jobId)?.max_seq ?? 0;

    let seq = maxSeq;
    for (const event of events) {
      seq += 1;
      db.run(`INSERT INTO job_events (job_id, seq, event, created_at_ms) VALUES (?, ?, ?, ?)`, [
        jobId,
        seq,
        JSON.stringify(event),
        now,
      ]);
      inserted.push({ seq, event, createdAtMs: now });
    }

    db.run(`UPDATE jobs SET updated_at_ms = ? WHERE id = ?`, [now, jobId]);
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }

  notifyJobEvent(jobId);
  return inserted;
}

export function getJobEventsSince(db: Database, jobId: string, afterSeq: number): JobEventRecord[] {
  const rows = db
    .query<JobEventRow & { job_id: string }, [string, number]>(
      `SELECT seq, event, created_at_ms FROM job_events WHERE job_id = ? AND seq > ? ORDER BY seq ASC`,
    )
    .all(jobId, afterSeq);

  return rows.map((row) => ({
    seq: row.seq,
    event: JSON.parse(row.event) as JobEvent,
    createdAtMs: row.created_at_ms,
  }));
}

export function getLatestJobEventSeq(db: Database, jobId: string): number {
  return (
    db
      .query<{ max_seq: number | null }, [string]>(
        `SELECT MAX(seq) AS max_seq FROM job_events WHERE job_id = ?`,
      )
      .get(jobId)?.max_seq ?? 0
  );
}
