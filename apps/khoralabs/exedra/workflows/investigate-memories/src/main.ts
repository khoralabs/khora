import type { InvestigatorAnswerWire } from "@khoralabs/memories-investigator";
import { task } from "@renderinc/sdk/workflows";
import { type InvestigateMemoryParams, investigateMemory } from "./investigate.ts";
import "./otel.ts";

const retry = {
  maxRetries: 2,
  waitDurationMs: 2000,
  backoffScaling: 2.0,
};

task(
  {
    name: "investigateMemory",
    retry,
    timeoutSeconds: 300,
  },
  async function investigateMemoryTask(
    params: InvestigateMemoryParams,
  ): Promise<InvestigatorAnswerWire> {
    const question = params.question.trim();
    if (question.length === 0) throw new Error("question is required");
    const namespace = params.namespace.trim();
    if (namespace.length === 0) throw new Error("namespace is required");
    return investigateMemory(params);
  },
);
