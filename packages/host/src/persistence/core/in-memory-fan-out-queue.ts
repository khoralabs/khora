import { FanOutWorkloadCodec, MAX_FAN_OUT_WORKLOAD_RECORDS } from "../../receipts/workload-codec";
import { fanOutJobId } from "./fan-out-job-id";
import type {
  FanOutJob,
  FanOutPlanningJobInput,
  FanOutQueuePort,
  FanOutWorkloadChunk,
} from "./port";

export const MAX_FAN_OUT_CHUNK_ORDINALS = MAX_FAN_OUT_WORKLOAD_RECORDS;

export function createInMemoryFanOutQueue(): FanOutQueuePort {
  const jobs = new Map<string, FanOutJob>();
  const chunks = new Map<string, FanOutWorkloadChunk[]>();
  return {
    enqueuePlanning(input: FanOutPlanningJobInput, nowMs: number): string {
      const id = fanOutJobId(input.tenantKey, input.postId);
      if (!jobs.has(id)) {
        jobs.set(id, {
          ...input,
          id,
          status: "planning_pending",
          plannedTargetCount: 0,
          routedTargetCount: 0,
          attemptCount: 0,
          availableAtMs: nowMs,
          leaseExpiresAtMs: null,
          lastError: null,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        });
      }
      return id;
    },
    getJob(id) {
      const job = jobs.get(id);
      return job === undefined ? undefined : { ...job };
    },
    tryClaimPlanning(nowMs, leaseMs) {
      const job = [...jobs.values()]
        .filter(
          (row) =>
            row.availableAtMs <= nowMs &&
            (row.status === "planning_pending" ||
              (row.status === "planning" && (row.leaseExpiresAtMs ?? 0) <= nowMs)),
        )
        .sort((a, b) => a.createdAtMs - b.createdAtMs)[0];
      if (job === undefined) return undefined;
      chunks.delete(job.id);
      job.status = "planning";
      job.attemptCount++;
      job.leaseExpiresAtMs = nowMs + leaseMs;
      job.updatedAtMs = nowMs;
      return { ...job };
    },
    appendWorkloadChunk(jobId, records, nowMs) {
      const stored = FanOutWorkloadCodec.encode(records);
      const job = jobs.get(jobId);
      if (job?.status !== "planning") throw new Error("fan-out job is not being planned");
      const rows = chunks.get(jobId) ?? [];
      const chunkIndex = rows.length;
      rows.push({
        jobId,
        chunkIndex,
        records: FanOutWorkloadCodec.decode(stored),
        status: "pending",
        attemptCount: 0,
        availableAtMs: nowMs,
        leaseExpiresAtMs: null,
        deliveredOrdinals: [],
        failedOrdinals: [],
        lastError: null,
        createdAtMs: nowMs,
      });
      chunks.set(jobId, rows);
      return chunkIndex;
    },
    getWorkloadChunk(jobId, chunkIndex) {
      const row = chunks.get(jobId)?.[chunkIndex];
      return row === undefined
        ? undefined
        : {
            ...row,
            records: row.records.map((record) => ({
              ...record,
              subscriptionMatches: [...record.subscriptionMatches],
            })),
            deliveredOrdinals: [...row.deliveredOrdinals],
            failedOrdinals: [...row.failedOrdinals],
          };
    },
    listWorkloadChunks(jobId) {
      return (chunks.get(jobId) ?? []).map((row) => ({
        ...row,
        records: row.records.map((record) => ({
          ...record,
          subscriptionMatches: [...record.subscriptionMatches],
        })),
        deliveredOrdinals: [...row.deliveredOrdinals],
        failedOrdinals: [...row.failedOrdinals],
      }));
    },
    completePlanning(jobId, plannedTargetCount, nowMs) {
      const job = jobs.get(jobId);
      if (job?.status !== "planning") throw new Error("fan-out job is not being planned");
      job.status = plannedTargetCount === 0 ? "completed" : "routing_pending";
      job.plannedTargetCount = plannedTargetCount;
      job.leaseExpiresAtMs = null;
      job.lastError = null;
      job.updatedAtMs = nowMs;
    },
    failPlanning(jobId, nowMs, error, retryAtMs) {
      const job = jobs.get(jobId);
      if (job?.status !== "planning") return;
      job.status = retryAtMs === undefined ? "failed" : "planning_pending";
      job.availableAtMs = retryAtMs ?? nowMs;
      job.leaseExpiresAtMs = null;
      job.lastError = error;
      job.updatedAtMs = nowMs;
    },
    tryClaimDelivery(nowMs, leaseMs) {
      const row = [...chunks.values()]
        .flat()
        .filter(
          (chunk) =>
            jobs.get(chunk.jobId)?.status === "routing_pending" &&
            chunk.availableAtMs <= nowMs &&
            (chunk.status === "pending" ||
              (chunk.status === "delivering" && (chunk.leaseExpiresAtMs ?? 0) <= nowMs)),
        )
        .sort((a, b) => a.createdAtMs - b.createdAtMs || a.chunkIndex - b.chunkIndex)[0];
      if (row === undefined) return undefined;
      row.status = "delivering";
      row.attemptCount++;
      row.leaseExpiresAtMs = nowMs + leaseMs;
      return { ...row, records: [...row.records] };
    },
    completeDelivery(jobId, chunkIndex, deliveredOrdinals, failedOrdinals, nowMs) {
      const row = chunks.get(jobId)?.[chunkIndex];
      const job = jobs.get(jobId);
      if (row?.status !== "delivering" || job?.status !== "routing_pending") {
        throw new Error("fan-out chunk is not being delivered");
      }
      row.status = "completed";
      row.leaseExpiresAtMs = null;
      row.deliveredOrdinals = [...new Set([...row.deliveredOrdinals, ...deliveredOrdinals])];
      row.failedOrdinals = [...new Set(failedOrdinals)];
      row.lastError = null;
      job.routedTargetCount = (chunks.get(jobId) ?? []).reduce(
        (count, chunk) => count + chunk.deliveredOrdinals.length,
        0,
      );
      if ((chunks.get(jobId) ?? []).every((chunk) => chunk.status === "completed")) {
        job.status = "completed";
      }
      job.updatedAtMs = nowMs;
    },
    failDelivery(jobId, chunkIndex, nowMs, error, retryAtMs) {
      const row = chunks.get(jobId)?.[chunkIndex];
      const job = jobs.get(jobId);
      if (row?.status !== "delivering" || job?.status !== "routing_pending") return;
      row.status = retryAtMs === undefined ? "failed" : "pending";
      row.availableAtMs = retryAtMs ?? nowMs;
      row.leaseExpiresAtMs = null;
      row.lastError = error;
      if (retryAtMs === undefined) {
        job.status = "failed";
        job.lastError = error;
      }
      job.updatedAtMs = nowMs;
    },
  };
}
