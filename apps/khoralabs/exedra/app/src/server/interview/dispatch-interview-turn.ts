import { Render } from "@renderinc/sdk";

import type { InterviewTurnWorkflowParams } from "../../../../shared/interview-turn-workflow.js";
import { getDb } from "../db/index.js";
import { appendJobEvents, setJobStatus } from "../jobs/db.js";
import { logger } from "../logger.js";

export function isInterviewTurnWorkflowConfigured(): boolean {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const slug = process.env.RENDER_INTERVIEW_TURN_WORKFLOW_SLUG?.trim();
  return apiKey !== undefined && apiKey.length > 0 && slug !== undefined && slug.length > 0;
}

export async function dispatchInterviewTurn(
  params: InterviewTurnWorkflowParams,
): Promise<string | null> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const slug = process.env.RENDER_INTERVIEW_TURN_WORKFLOW_SLUG?.trim();
  if (apiKey === undefined || apiKey.length === 0 || slug === undefined || slug.length === 0) {
    logger.warn(
      "interview turn workflow skipped: RENDER_API_KEY or RENDER_INTERVIEW_TURN_WORKFLOW_SLUG not set",
    );
    return null;
  }

  const render = new Render({ token: apiKey });
  const startedRun = await render.workflows.startTask(`${slug}/runInterviewTurn`, [params]);

  const db = getDb();
  appendJobEvents(db, params.jobId, [{ type: "status", status: "running" }]);
  setJobStatus(db, params.jobId, "running", { taskRunId: startedRun.taskRunId });

  return startedRun.taskRunId;
}

export async function cancelInterviewTurnTaskRun(
  taskRunId: string | null | undefined,
): Promise<void> {
  if (taskRunId === null || taskRunId === undefined || taskRunId.length === 0) return;

  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) return;

  const render = new Render({ token: apiKey });
  await render.workflows.cancelTaskRun(taskRunId).catch(() => undefined);
}
