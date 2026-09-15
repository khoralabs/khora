import type { Database } from "bun:sqlite";
import {
  assertFanOutPlanningInput,
  fanOutPolicyFromColumns,
  fanOutPolicyLimit,
  fanOutPolicyMode,
} from "../../fanout/policy";
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
  fan_out_policy: string;
  public_push_target_limit: number | null;
  delivery_mode: string;
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

type ChunkRow = {
  job_id: string;
  chunk_index: number;
  workload_gzip: Uint8Array;
  status: FanOutWorkloadChunk["status"];
  attempt_count: number;
  available_at_ms: number;
  lease_expires_at_ms: number | null;
  delivered_ordinals_json: string;
  failed_ordinals_json: string;
  last_error: string | null;
  created_at_ms: number;
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
    fanOutPolicy: fanOutPolicyFromColumns(row.fan_out_policy, row.public_push_target_limit),
    deliveryMode: row.delivery_mode === "pull" ? "pull" : "push",
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

function mapChunk(row: ChunkRow): FanOutWorkloadChunk {
  return {
    jobId: row.job_id,
    chunkIndex: row.chunk_index,
    records: FanOutWorkloadCodec.decode(row.workload_gzip),
    status: row.status,
    attemptCount: row.attempt_count,
    availableAtMs: row.available_at_ms,
    leaseExpiresAtMs: row.lease_expires_at_ms,
    deliveredOrdinals: JSON.parse(row.delivered_ordinals_json),
    failedOrdinals: JSON.parse(row.failed_ordinals_json),
    lastError: row.last_error,
    createdAtMs: row.created_at_ms,
  };
}

export function ensureFanOutQueueSchema(db: Database): void {
  db.run(FAN_OUT_QUEUE_DDL);
  const jobColumns = db
    .query<{ name: string }, []>("PRAGMA table_info(fan_out_jobs)")
    .all()
    .map(({ name }) => name);
  if (!jobColumns.includes("fan_out_policy")) {
    db.run("ALTER TABLE fan_out_jobs ADD COLUMN fan_out_policy TEXT NOT NULL DEFAULT 'push'");
  }
  if (!jobColumns.includes("public_push_target_limit")) {
    db.run("ALTER TABLE fan_out_jobs ADD COLUMN public_push_target_limit INTEGER");
  }
  if (!jobColumns.includes("delivery_mode")) {
    db.run("ALTER TABLE fan_out_jobs ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'push'");
  }
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
  const additions: Record<string, string> = {
    attempt_count: "INTEGER NOT NULL DEFAULT 0",
    available_at_ms: "INTEGER NOT NULL DEFAULT 0",
    lease_expires_at_ms: "INTEGER",
    delivered_ordinals_json: "TEXT NOT NULL DEFAULT '[]'",
    failed_ordinals_json: "TEXT NOT NULL DEFAULT '[]'",
    last_error: "TEXT",
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!columns.includes(name)) {
      db.run(`ALTER TABLE fan_out_workload_chunks ADD COLUMN ${name} ${definition}`);
    }
  }
  db.run(`CREATE INDEX IF NOT EXISTS idx_fan_out_chunks_delivery
    ON fan_out_workload_chunks (status, available_at_ms, created_at_ms)`);
}

export function createSqliteFanOutQueue(db: Database): FanOutQueuePort {
  ensureFanOutQueueSchema(db);
  const select = "SELECT * FROM fan_out_jobs WHERE id = ?";
  return {
    enqueuePlanning(input, nowMs) {
      assertFanOutPlanningInput(input);
      const id = fanOutJobId(input.tenantKey, input.postId);
      db.query(`INSERT OR IGNORE INTO fan_out_jobs (
        id, tenant_key, post_id, source_cell_id, source_record_key, source_content_hash,
        cell_pool_count, author_principal_id, post_kind, post_metadata_json, visibility,
        fan_out_policy, public_push_target_limit, delivery_mode, status, available_at_ms,
        created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'push', 'planning_pending', ?, ?, ?)`).run(
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
        fanOutPolicyMode(input.fanOutPolicy),
        fanOutPolicyLimit(input.fanOutPolicy),
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
    getWorkloadChunk(jobId, chunkIndex) {
      const row = db
        .query<ChunkRow, [string, number]>(
          "SELECT * FROM fan_out_workload_chunks WHERE job_id=? AND chunk_index=?",
        )
        .get(jobId, chunkIndex);
      return row === null ? undefined : mapChunk(row);
    },
    listWorkloadChunks(jobId) {
      return db
        .query<ChunkRow, [string]>(`SELECT * FROM fan_out_workload_chunks
        WHERE job_id=? ORDER BY chunk_index`)
        .all(jobId)
        .map(mapChunk);
    },
    completePlanning(jobId, plannedTargetCount, nowMs, deliveryMode = "push") {
      const result = db
        .query(`UPDATE fan_out_jobs SET
          status=CASE WHEN ?=0 OR ?='pull' THEN 'completed' ELSE 'routing_pending' END,
          planned_target_count=?, delivery_mode=?, lease_expires_at_ms=NULL, last_error=NULL,
          updated_at_ms=?
        WHERE id=? AND status='planning'`)
        .run(plannedTargetCount, deliveryMode, plannedTargetCount, deliveryMode, nowMs, jobId);
      if (result.changes !== 1) throw new Error("fan-out job is not being planned");
      if (deliveryMode === "pull") {
        db.query(
          `UPDATE fan_out_workload_chunks SET status='completed', lease_expires_at_ms=NULL
           WHERE job_id=?`,
        ).run(jobId);
      }
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
    tryClaimDelivery(nowMs, leaseMs) {
      return db.transaction(() => {
        const row = db
          .query<
            { job_id: string; chunk_index: number },
            [number, number]
          >(`SELECT c.job_id, c.chunk_index FROM fan_out_workload_chunks c
          JOIN fan_out_jobs j ON j.id = c.job_id
          WHERE j.status='routing_pending' AND c.available_at_ms <= ? AND (
            c.status='pending' OR (c.status='delivering' AND c.lease_expires_at_ms <= ?)
          ) ORDER BY c.created_at_ms, c.job_id, c.chunk_index LIMIT 1`)
          .get(nowMs, nowMs);
        if (row === null) return undefined;
        db.query(`UPDATE fan_out_workload_chunks SET status='delivering',
          attempt_count=attempt_count+1, lease_expires_at_ms=?, last_error=NULL
          WHERE job_id=? AND chunk_index=?`).run(nowMs + leaseMs, row.job_id, row.chunk_index);
        return this.getWorkloadChunk(row.job_id, row.chunk_index);
      })();
    },
    completeDelivery(jobId, chunkIndex, deliveredOrdinals, failedOrdinals, nowMs) {
      db.transaction(() => {
        const current = db
          .query<
            { status: FanOutWorkloadChunk["status"]; delivered_ordinals_json: string },
            [string, number]
          >(`SELECT status, delivered_ordinals_json FROM fan_out_workload_chunks
             WHERE job_id=? AND chunk_index=?`)
          .get(jobId, chunkIndex);
        if (current?.status !== "delivering") {
          throw new Error("fan-out chunk is not being delivered");
        }
        const delivered = [
          ...new Set([
            ...(JSON.parse(current.delivered_ordinals_json) as number[]),
            ...deliveredOrdinals,
          ]),
        ];
        db.query(`UPDATE fan_out_workload_chunks SET status='completed',
          lease_expires_at_ms=NULL, delivered_ordinals_json=?, failed_ordinals_json=?,
          last_error=NULL WHERE job_id=? AND chunk_index=? AND status='delivering'`).run(
          JSON.stringify(delivered),
          JSON.stringify([...new Set(failedOrdinals)]),
          jobId,
          chunkIndex,
        );
        const summary = db
          .query<{ pending: number; routed: number }, [string]>(`SELECT
            SUM(CASE WHEN status != 'completed' THEN 1 ELSE 0 END) AS pending,
            SUM(json_array_length(delivered_ordinals_json)) AS routed
            FROM fan_out_workload_chunks WHERE job_id=?`)
          .get(jobId);
        db.query(`UPDATE fan_out_jobs SET status=?, routed_target_count=?,
          updated_at_ms=?, lease_expires_at_ms=NULL WHERE id=? AND status='routing_pending'`).run(
          (summary?.pending ?? 0) === 0 ? "completed" : "routing_pending",
          summary?.routed ?? 0,
          nowMs,
          jobId,
        );
      })();
    },
    failDelivery(jobId, chunkIndex, nowMs, error, retryAtMs) {
      db.transaction(() => {
        db.query(`UPDATE fan_out_workload_chunks SET status=?, available_at_ms=?,
          lease_expires_at_ms=NULL, last_error=? WHERE job_id=? AND chunk_index=?
          AND status='delivering'`).run(
          retryAtMs === undefined ? "failed" : "pending",
          retryAtMs ?? nowMs,
          error,
          jobId,
          chunkIndex,
        );
        if (retryAtMs === undefined) {
          db.query(`UPDATE fan_out_jobs SET status='failed', last_error=?,
            updated_at_ms=? WHERE id=? AND status='routing_pending'`).run(error, nowMs, jobId);
        }
      })();
    },
    getReconcileAfterPrincipalId() {
      const row = db
        .query<{ after_principal_id: string | null }, []>(
          "SELECT after_principal_id FROM fan_out_reconcile_cursor WHERE singleton = 1",
        )
        .get();
      return row?.after_principal_id ?? undefined;
    },
    setReconcileAfterPrincipalId(afterPrincipalId) {
      db.query(
        `INSERT INTO fan_out_reconcile_cursor(singleton, after_principal_id) VALUES (1, ?)
         ON CONFLICT(singleton) DO UPDATE SET after_principal_id = excluded.after_principal_id`,
      ).run(afterPrincipalId ?? null);
    },
  };
}
