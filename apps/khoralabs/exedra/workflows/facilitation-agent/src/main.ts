import { task } from "@renderinc/sdk/workflows";
import type { FacilitationWorkflowParams } from "../../../shared/facilitation-workflow.ts";
import { runFacilitationEventWorkflow } from "./run-facilitation-workflow.ts";
import "./otel.ts";

const retry = {
  maxRetries: 0,
  waitDurationMs: 2000,
  backoffScaling: 2.0,
};

task(
  {
    name: "runFacilitationEvent",
    retry,
    timeoutSeconds: 300,
  },
  async function runFacilitationEventTask(
    params: FacilitationWorkflowParams,
  ): Promise<{ ok: true }> {
    await runFacilitationEventWorkflow(params);
    return { ok: true };
  },
);
