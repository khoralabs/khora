import { task } from "@renderinc/sdk/workflows";
import { runGenerateResponseWorkflow } from "./run-generate-response-workflow.ts";
import type { GenerateResponseResult, GenerateResponseWorkflowParams } from "./types.ts";
import "./otel.ts";

export type { GenerateResponseResult, GenerateResponseWorkflowParams };

task(
  {
    name: "generateAgentResponse",
    retry: {
      maxRetries: 0,
      waitDurationMs: 2000,
      backoffScaling: 2.0,
    },
    timeoutSeconds: 600,
  },
  async function generateAgentResponseTask(
    params: GenerateResponseWorkflowParams,
  ): Promise<GenerateResponseResult> {
    return runGenerateResponseWorkflow(params);
  },
);
