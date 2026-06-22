import { Render } from "@renderinc/sdk";
import { nanoid } from "nanoid";

import type { FacilitationWorkflowParams } from "../../../../shared/facilitation-workflow.js";
import type { getDb } from "../db/index.js";
import { getOrCreateFacilitationThread } from "../db/sessions.js";
import { appendJobEvents, createJob, setJobStatus } from "../jobs/db.js";
import { logger } from "../logger.js";
import { runFacilitationEventInProcess } from "./run-facilitation-event-in-process.js";

export function isFacilitationWorkflowConfigured(): boolean {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const slug = process.env.RENDER_FACILITATION_WORKFLOW_SLUG?.trim();
  return apiKey !== undefined && apiKey.length > 0 && slug !== undefined && slug.length > 0;
}

export async function dispatchFacilitationEvent(params: {
  db: ReturnType<typeof getDb>;
  sessionId: string;
  participantUserId: string;
  threadId: string;
}): Promise<void> {
  const jobId = nanoid();
  const facilitationThreadId = getOrCreateFacilitationThread(params.db, params.sessionId);

  const workflowParams: FacilitationWorkflowParams = {
    jobId,
    sessionId: params.sessionId,
    participantUserId: params.participantUserId,
    threadId: params.threadId,
    event: "participant_interview_completed",
  };

  createJob(params.db, {
    id: jobId,
    kind: "facilitation_event",
    ownerUserId: params.participantUserId,
    payload: { ...workflowParams, facilitationThreadId },
  });

  if (!isFacilitationWorkflowConfigured()) {
    logger.warn("facilitation workflow not configured; running in-process");
    await runFacilitationEventInProcess(params.db, workflowParams);
    return;
  }

  const apiKey = process.env.RENDER_API_KEY?.trim() ?? "";
  const slug = process.env.RENDER_FACILITATION_WORKFLOW_SLUG?.trim() ?? "";
  const render = new Render({ token: apiKey });
  const startedRun = await render.workflows.startTask(`${slug}/runFacilitationEvent`, [
    workflowParams,
  ]);

  const db = params.db;
  appendJobEvents(db, jobId, [{ type: "status", status: "running" }]);
  setJobStatus(db, jobId, "running", { taskRunId: startedRun.taskRunId });
}
