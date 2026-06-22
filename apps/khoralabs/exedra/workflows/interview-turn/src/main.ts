import { task } from "@renderinc/sdk/workflows";
import type { InterviewTurnWorkflowParams } from "../../../shared/interview-turn-workflow.ts";
import { runInterviewTurnWorkflow } from "./run-turn-workflow.ts";
import "./otel.ts";

const retry = {
  maxRetries: 1,
  waitDurationMs: 2000,
  backoffScaling: 2.0,
};

task(
  {
    name: "runInterviewTurn",
    retry,
    timeoutSeconds: 600,
  },
  async function runInterviewTurnTask(params: InterviewTurnWorkflowParams): Promise<{ ok: true }> {
    await runInterviewTurnWorkflow(params);
    return { ok: true };
  },
);
