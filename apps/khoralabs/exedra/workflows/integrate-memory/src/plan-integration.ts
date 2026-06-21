import { MemoryIntegratorClient } from "@khoralabs/memories-integrator";
import { exedraBeliefIntegratorInstructions } from "../../../shared/belief-agent-instructions.ts";
import type { IntegratorPlanWireJson } from "../../../shared/belief-integration.ts";
import {
  createRemoteMemoriesClient,
  getAgentRegistry,
  resolveChatModel,
  resolveEmbeddingModel,
  resolveIntegratorMaxSteps,
} from "./agent-runtime.ts";
import { createWorkflowMemoriesAgentTelemetry } from "./agent-telemetry.ts";

export async function planIntegration(args: {
  content: string;
  userId: string;
  namespace: string;
}): Promise<IntegratorPlanWireJson> {
  const client = createRemoteMemoriesClient(args.userId);
  const integrator = new MemoryIntegratorClient({
    registry: getAgentRegistry(),
    namespace: args.namespace,
    model: resolveChatModel(),
    client,
    embeddingModel: resolveEmbeddingModel(),
    instructions: exedraBeliefIntegratorInstructions,
  });
  const telemetry = await createWorkflowMemoriesAgentTelemetry(client);

  const { plan } = await integrator.integrate({
    content: args.content,
    maxSteps: resolveIntegratorMaxSteps(),
    telemetry,
  });

  return {
    nodeLabels: plan.nodeLabels ?? {},
    edges: (plan.edges ?? []) as Record<string, unknown>[],
    ...(plan.properties !== undefined ? { properties: plan.properties } : {}),
  };
}
