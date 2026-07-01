import { getAgentChatService } from "../chat-service.ts";
import { runAgentWorkflow } from "../run-agent-workflow.ts";
import {
  createHarnessMemoriesClientForAgent,
  resolveMemoriesServiceBaseUrl,
} from "../tools/_helpers/toolkit-env.ts";
import {
  createHarnessKhoraClientForAgent,
  resolveKhoraServerBaseUrl,
} from "../tools/khora/_helpers/khora-client-factory.ts";
import { resolveHarnessEmbeddingModel } from "../tools/memories/_helpers/embedding-model.ts";
import type { AgentWorkflowParams, AgentWorkflowResult } from "../types.ts";
import { configureTursoWorldEnv } from "../world.ts";

export async function agentResponse(params: AgentWorkflowParams): Promise<AgentWorkflowResult> {
  "use workflow";

  return await executeAgentResponse(params);
}

async function executeAgentResponse(params: AgentWorkflowParams): Promise<AgentWorkflowResult> {
  "use step";

  configureTursoWorldEnv();

  const memoriesBaseUrl = resolveMemoriesServiceBaseUrl();
  const memoriesClient =
    memoriesBaseUrl === undefined
      ? undefined
      : await createHarnessMemoriesClientForAgent({
          baseUrl: memoriesBaseUrl,
          agentDid: params.agent.actingFor.id,
        });

  const khoraBaseUrl = resolveKhoraServerBaseUrl();
  const khoraClient =
    khoraBaseUrl === undefined
      ? undefined
      : await createHarnessKhoraClientForAgent({
          baseUrl: khoraBaseUrl,
          agentDid: params.agent.actingFor.id,
        });

  return runAgentWorkflow(params, {
    chatService: getAgentChatService(),
    memoriesClient,
    khoraClient,
    embeddingModel: resolveHarnessEmbeddingModel(),
  });
}
