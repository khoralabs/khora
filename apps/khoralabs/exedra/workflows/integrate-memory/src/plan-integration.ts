import { MemoryIntegratorClient } from "@khoralabs/memories-integrator";
import {
  createRemoteMemoriesClient,
  getAgentRegistry,
  resolveChatModel,
  resolveEmbeddingModel,
  resolveIntegratorMaxSteps,
} from "./agent-runtime.ts";
import { createWorkflowMemoriesAgentTelemetry } from "./agent-telemetry.ts";
import { exedraBeliefIntegratorInstructions } from "./belief-instructions.ts";
import type { IntegratorPlanWireJson } from "./belief-integration.ts";

export type PlanIntegrationResult = {
  plan: IntegratorPlanWireJson;
  allowedPeerKeys: string[];
};

export async function planIntegration(args: {
  content: string;
  userId: string;
  namespace: string;
}): Promise<PlanIntegrationResult> {
  const client = await createRemoteMemoriesClient(args.userId);
  const integrator = new MemoryIntegratorClient({
    registry: getAgentRegistry(),
    namespace: args.namespace,
    model: resolveChatModel(),
    client,
    embeddingModel: resolveEmbeddingModel(),
    instructions: exedraBeliefIntegratorInstructions,
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
