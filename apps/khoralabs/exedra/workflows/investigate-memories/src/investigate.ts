import {
  completeJob,
  failJob,
  postJobEvents,
} from "@khoralabs/exedra-workflows-shared/exedra-jobs-client";
import {
  type InvestigatorAnswerWire,
  MemoryInvestigatorClient,
} from "@khoralabs/memories-investigator";
import {
  createRemoteMemoriesClient,
  getAgentRegistry,
  resolveEmbeddingModel,
  resolveInvestigatorMaxSteps,
  resolveInvestigatorModel,
} from "./agent-runtime.ts";
import { createWorkflowMemoriesAgentTelemetry } from "./agent-telemetry.ts";

export type InvestigateMemoryParams = {
  jobId: string;
  userId: string;
  orgId?: string;
  namespace: string;
  question: string;
  maxSteps?: number;
};

export async function investigateMemory(
  params: InvestigateMemoryParams,
): Promise<InvestigatorAnswerWire> {
  const jobId = params.jobId.trim();
  if (jobId.length === 0) throw new Error("jobId is required");

  await postJobEvents(jobId, [
    { type: "status", status: "running" },
    { type: "investigation_step", step: 0, message: "Investigating…" },
  ]);

  try {
    const client = createRemoteMemoriesClient(params.userId, params.orgId);
    const maxSteps = params.maxSteps ?? resolveInvestigatorMaxSteps();
    const investigator = new MemoryInvestigatorClient({
      registry: getAgentRegistry(),
      namespace: params.namespace.trim(),
      model: resolveInvestigatorModel(),
      client,
      embeddingModel: resolveEmbeddingModel(),
    });
    const telemetry = await createWorkflowMemoriesAgentTelemetry(client);
    const { answer } = await investigator.investigate({
      question: params.question.trim(),
      maxSteps,
      telemetry,
    });

    await postJobEvents(jobId, [{ type: "investigation_complete", answer }]);
    await completeJob(jobId, { result: answer });
    return answer;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(jobId, message);
    throw err;
  }
}
