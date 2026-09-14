import { fanOutJobId } from "./fan-out-job-id";
import type {
  FanOutJob,
  FanOutPlanningJobInput,
  FanOutQueuePort,
  FanOutWorkloadChunk,
} from "./port";

export const MAX_FAN_OUT_CHUNK_ORDINALS = 1_000;

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
    appendWorkloadChunk(jobId, recipientOrdinals, nowMs) {
      if (recipientOrdinals.length === 0 || recipientOrdinals.length > MAX_FAN_OUT_CHUNK_ORDINALS) {
        throw new Error(
          `fan-out workload chunk must contain 1-${MAX_FAN_OUT_CHUNK_ORDINALS} ordinals`,
        );
      }
      const job = jobs.get(jobId);
      if (job?.status !== "planning") throw new Error("fan-out job is not being planned");
      const rows = chunks.get(jobId) ?? [];
      const chunkIndex = rows.length;
      rows.push({
        jobId,
        chunkIndex,
        recipientOrdinals: [...recipientOrdinals],
        status: "pending",
        createdAtMs: nowMs,
      });
      chunks.set(jobId, rows);
      return chunkIndex;
    },
    listWorkloadChunks(jobId) {
      return (chunks.get(jobId) ?? []).map((row) => ({
        ...row,
        recipientOrdinals: [...row.recipientOrdinals],
      }));
    },
    completePlanning(jobId, plannedTargetCount, nowMs) {
      const job = jobs.get(jobId);
      if (job?.status !== "planning") throw new Error("fan-out job is not being planned");
      job.status = "routing_pending";
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
  };
}
