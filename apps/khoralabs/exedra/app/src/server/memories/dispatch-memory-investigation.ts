import { Render } from "@renderinc/sdk";

import type { JobEvent, MemoryInvestigationJobPayload } from "../../../shared/jobs.js";
import { getDb } from "../db/index.js";
import { appendJobEvents, createJob, setJobStatus } from "../jobs/db.js";
import { logger } from "../logger.js";

import type { MemoriesAccess, MemoriesInvestigateScope } from "./api-handlers.js";
import { runInProcessInvestigation } from "./api-handlers.js";

export function isWorkflowInvestigationConfigured(): boolean {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const slug = process.env.RENDER_INVESTIGATION_WORKFLOW_SLUG?.trim();
  return apiKey !== undefined && apiKey.length > 0 && slug !== undefined && slug.length > 0;
}

async function dispatchWorkflowInvestigation(args: {
  jobId: string;
  scope: MemoriesInvestigateScope;
  namespace: string;
  question: string;
  maxSteps: number;
}): Promise<void> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const slug = process.env.RENDER_INVESTIGATION_WORKFLOW_SLUG?.trim();
  if (apiKey === undefined || apiKey.length === 0 || slug === undefined || slug.length === 0) {
    throw new Error("Memory investigation workflow is not configured");
  }

  const render = new Render({ token: apiKey });
  const startedRun = await render.workflows.startTask(`${slug}/investigateMemory`, [
    {
      jobId: args.jobId,
      userId: args.scope.userId,
      ...(args.scope.orgId !== undefined && args.scope.orgId.length > 0
        ? { orgId: args.scope.orgId }
        : {}),
      namespace: args.namespace,
      question: args.question,
      maxSteps: args.maxSteps,
    },
  ]);

  const db = getDb();
  appendJobEvents(db, args.jobId, [{ type: "status", status: "running" }]);
  setJobStatus(db, args.jobId, "running", { taskRunId: startedRun.taskRunId });
}

async function runInProcessInvestigationJob(args: {
  jobId: string;
  access: MemoriesAccess;
  namespace: string;
  question: string;
  maxSteps: number;
  resolution?: string;
}): Promise<void> {
  const db = getDb();
  appendJobEvents(db, args.jobId, [
    { type: "status", status: "running" },
    { type: "investigation_step", step: 0, message: "Investigating…" },
  ]);
  setJobStatus(db, args.jobId, "running");

  try {
    const answer = await runInProcessInvestigation({
      access: args.access,
      namespace: args.namespace,
      question: args.question,
      maxSteps: args.maxSteps,
      resolution: args.resolution,
    });
    appendJobEvents(db, args.jobId, [{ type: "investigation_complete", answer }]);
    setJobStatus(db, args.jobId, "done", { result: answer, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const events: JobEvent[] = [{ type: "error", error: message }];
    appendJobEvents(db, args.jobId, events);
    setJobStatus(db, args.jobId, "failed", { error: message });
  }
}

export async function dispatchMemoryInvestigation(args: {
  ownerUserId: string;
  scope: MemoriesInvestigateScope;
  namespace: string;
  question: string;
  maxSteps: number;
  resolution?: string;
  access?: MemoriesAccess;
}): Promise<{ jobId: string }> {
  const db = getDb();
  const payload: MemoryInvestigationJobPayload = {
    namespace: args.namespace,
    question: args.question,
    maxSteps: args.maxSteps,
    userId: args.scope.userId,
    ...(args.scope.orgId !== undefined ? { orgId: args.scope.orgId } : {}),
  };

  const job = createJob(db, {
    kind: "memory_investigation",
    payload,
    ownerUserId: args.ownerUserId,
    status: "pending",
  });

  if (isWorkflowInvestigationConfigured()) {
    void dispatchWorkflowInvestigation({
      jobId: job.id,
      scope: args.scope,
      namespace: args.namespace,
      question: args.question,
      maxSteps: args.maxSteps,
    }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, jobId: job.id }, "memory investigation workflow dispatch failed");
      appendJobEvents(db, job.id, [{ type: "error", error: message }]);
      setJobStatus(db, job.id, "failed", { error: message });
    });
    return { jobId: job.id };
  }

  if (args.access === undefined) {
    throw new Error("Memory investigation requires workflow configuration or in-process access");
  }

  void runInProcessInvestigationJob({
    jobId: job.id,
    access: args.access,
    namespace: args.namespace,
    question: args.question,
    maxSteps: args.maxSteps,
    resolution: args.resolution,
  });

  return { jobId: job.id };
}
