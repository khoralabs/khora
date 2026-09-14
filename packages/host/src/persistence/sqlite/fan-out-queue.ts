import type { Database } from "bun:sqlite";
import { FanOutWorkloadCodec } from "../../receipts/workload-codec";
import { fanOutJobId } from "../core/fan-out-job-id";
import type { FanOutJob, FanOutQueuePort, FanOutWorkloadChunk } from "../core/port";
import { FAN_OUT_QUEUE_DDL } from "../core/schema/fan-out-queue-ddl";

type JobRow = {
  id: string;
  tenant_key: string;
  post_id: string;
  source_cell_id: string;
  source_record_key: string;
  source_content_hash: string;
  cell_pool_count: number;
  author_principal_id: string;
  post_kind: string;
  post_metadata_json: string;
  visibility: string;
  status: FanOutJob["status"];
  planned_target_count: number;
  routed_target_count: number;
  attempt_count: number;
  available_at_ms: number;
  lease_expires_at_ms: number | null;
  last_error: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

function mapJob(row: JobRow): FanOutJob {
  return {
    id: row.id,
    tenantKey: row.tenant_key,
    postId: row.post_id,
    sourceCellId: row.source_cell_id,
    sourceRecordKey: row.source_record_key,
    sourceContentHash: row.source_content_hash,
    cellPoolCount: row.cell_pool_count,
    authorPrincipalId: row.author_principal_id,
    postKind: row.post_kind,
    postMetadata: JSON.parse(row.post_metadata_json),
    visibility: row.visibility,
    status: row.status,
    plannedTargetCount: row.planned_target_count,
    routedTargetCount: row.routed_target_count,
    attemptCount: row.attempt_count,
    availableAtMs: row.available_at_ms,
    leaseExpiresAtMs: row.lease_expires_at_ms,
    lastError: row.last_error,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function ensureFanOutQueueSchema(db: Database): void {
  db.run(FAN_OUT_QUEUE_DDL);
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(fan_out_workload_chunks)")
    .all()
    .map(({ name }) => name);
  if (!columns.includes("workload_gzip")) {
    db.run("ALTER TABLE fan_out_workload_chunks ADD COLUMN workload_gzip BLOB");
    if (columns.includes("recipient_ordinals_json")) {
      const rows = db
        .query<{ job_id: string; chunk_index: number; recipient_ordinals_json: string }, []>(
          `SELECT job_id, chunk_index, recipient_ordinals_json
           FROM fan_out_workload_chunks`,
        )
        .all();
      const update = db.prepare(
        `UPDATE fan_out_workload_chunks SET workload_gzip = ?
         WHERE job_id = ? AND chunk_index = ?`,
      );
      db.transaction(() => {
        for (const row of rows) {
          const ordinals = JSON.parse(row.recipient_ordinals_json) as number[];
          update.run(
            FanOutWorkloadCodec.encode(
              ordinals.map((ordinal) => ({ ordinal, subscriptionMatches: [] })),
            ),
            row.job_id,
            row.chunk_index,
          );
        }
      })();
    }
  }
}

export function createSqliteFanOutQueue(db: Database): FanOutQueuePort {
  ensureFanOutQueueSchema(db);
  const select = "SELECT * FROM fan_out_jobs WHERE id = ?";
  return {
    enqueuePlanning(input, nowMs) {
      const id = fanOutJobId(input.tenantKey, input.postId);
      db.query(`INSERT OR IGNORE INTO fan_out_jobs (
        id, tenant_key, post_id, source_cell_id, source_record_key, source_content_hash,
        cell_pool_count, author_principal_id, post_kind, post_metadata_json, visibility,
        status, available_at_ms, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planning_pending', ?, ?, ?)`).run(
        id,
        input.tenantKey,
        input.postId,
        input.sourceCellId,
        input.sourceRecordKey,
        input.sourceContentHash,
        input.cellPoolCount,
        input.authorPrincipalId,
        input.postKind,
        JSON.stringify(input.postMetadata),
        input.visibility,
        nowMs,
        nowMs,
        nowMs,
      );
      return id;
    },
    getJob(id) {
      const row = db.query<JobRow, [string]>(select).get(id);
      return row === null ? undefined : mapJob(row);
    },
    tryClaimPlanning(nowMs, leaseMs) {
      return db.transaction(() => {
        const row = db
          .query<JobRow, [number, number]>(`SELECT * FROM fan_out_jobs
          WHERE available_at_ms <= ? AND (
            status = 'planning_pending' OR
            (status = 'planning' AND lease_expires_at_ms <= ?)
          ) ORDER BY created_at_ms, id LIMIT 1`)
          .get(nowMs, nowMs);
        if (row === null) return undefined;
        db.query("DELETE FROM fan_out_workload_chunks WHERE job_id=?").run(row.id);
        db.query(`UPDATE fan_out_jobs SET status='planning', attempt_count=attempt_count+1,
          lease_expires_at_ms=?, updated_at_ms=? WHERE id=?`).run(nowMs + leaseMs, nowMs, row.id);
        const claimed = db.query<JobRow, [string]>(select).get(row.id);
        return claimed === null ? undefined : mapJob(claimed);
      })();
    },
    appendWorkloadChunk(jobId, records, nowMs) {
      const workload = FanOutWorkloadCodec.encode(records);
      const job = this.getJob(jobId);
      if (job?.status !== "planning") throw new Error("fan-out job is not being planned");
      const next =
        db
          .query<{ next: number }, [string]>(
            "SELECT COALESCE(MAX(chunk_index) + 1, 0) AS next FROM fan_out_workload_chunks WHERE job_id=?",
          )
          .get(jobId)?.next ?? 0;
      db.query(`INSERT INTO fan_out_workload_chunks
        (job_id, chunk_index, workload_gzip, status, created_at_ms)
        VALUES (?, ?, ?, 'pending', ?)`).run(jobId, next, workload, nowMs);
      return next;
    },
    listWorkloadChunks(jobId) {
      return db
        .query<
          {
            job_id: string;
            chunk_index: number;
            workload_gzip: Uint8Array;
            status: FanOutWorkloadChunk["status"];
            created_at_ms: number;
          },
          [string]
        >(`SELECT * FROM fan_out_workload_chunks
        WHERE job_id=? ORDER BY chunk_index`)
        .all(jobId)
        .map((row) => ({
          jobId: row.job_id,
          chunkIndex: row.chunk_index,
          records: FanOutWorkloadCodec.decode(row.workload_gzip),
          status: row.status,
          createdAtMs: row.created_at_ms,
        }));
    },
    completePlanning(jobId, plannedTargetCount, nowMs) {
      const result = db
        .query(`UPDATE fan_out_jobs SET status='routing_pending',
        planned_target_count=?, lease_expires_at_ms=NULL, last_error=NULL, updated_at_ms=?
        WHERE id=? AND status='planning'`)
        .run(plannedTargetCount, nowMs, jobId);
      if (result.changes !== 1) throw new Error("fan-out job is not being planned");
    },
    failPlanning(jobId, nowMs, error, retryAtMs) {
      db.query(`UPDATE fan_out_jobs SET status=?, available_at_ms=?,
        lease_expires_at_ms=NULL, last_error=?, updated_at_ms=?
        WHERE id=? AND status='planning'`).run(
        retryAtMs === undefined ? "failed" : "planning_pending",
        retryAtMs ?? nowMs,
        error,
        nowMs,
        jobId,
      );
    },
  };
}
