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
  userId: string;
  orgId?: string;
  namespace: string;
  question: string;
  maxSteps?: number;
};

export async function investigateMemory(
  params: InvestigateMemoryParams,
): Promise<InvestigatorAnswerWire> {
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
  return answer;
}
