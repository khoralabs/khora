import { exedraDocumentIntegratorInstructions } from "@khoralabs/exedra-workflows-process-document/document-agent-instructions";
import { MemoryIntegratorClient } from "@khoralabs/memories-integrator";
import {
  createRemoteMemoriesClient,
  getAgentRegistry,
  resolveChatModel,
  resolveEmbeddingModel,
  resolveIntegratorMaxSteps,
} from "./agent-runtime.ts";
import { createWorkflowMemoriesAgentTelemetry } from "./agent-telemetry.ts";
import type { PlanIntegrationResult } from "./plan-integration.ts";

export async function planDocumentIntegration(args: {
  content: string;
  userId: string;
  namespace: string;
}): Promise<PlanIntegrationResult> {
  const client = createRemoteMemoriesClient(args.userId);
  const integrator = new MemoryIntegratorClient({
    registry: getAgentRegistry(),
    namespace: args.namespace,
    model: resolveChatModel(),
    client,
    embeddingModel: resolveEmbeddingModel(),
    instructions: exedraDocumentIntegratorInstructions,
  });
  const telemetry = await createWorkflowMemoriesAgentTelemetry(client);

  const { plan, discoveredMemoryKeys } = await integrator.integrate({
    content: args.content,
    maxSteps: resolveIntegratorMaxSteps(),
    telemetry,
  });

  return {
    plan: {
      nodeLabels: plan.nodeLabels ?? {},
      edges: (plan.edges ?? []) as Record<string, unknown>[],
      ...(plan.properties !== undefined ? { properties: plan.properties } : {}),
    },
    allowedPeerKeys: discoveredMemoryKeys,
  };
}
