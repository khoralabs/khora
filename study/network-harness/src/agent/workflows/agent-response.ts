import { start } from "workflow/api";
import { ensureDevAgentIdentity, getAgentChatService } from "../chat-service.ts";
import { type RunAgentWorkflowDependencies, runAgentWorkflow } from "../run-agent-workflow.ts";
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

export type AgentResponseDeps = RunAgentWorkflowDependencies;

export async function agentResponse(params: AgentWorkflowParams): Promise<AgentWorkflowResult> {
  "use workflow";

  return await executeAgentResponse(params);
}

export async function executeAgentResponse(
  params: AgentWorkflowParams,
  deps?: AgentResponseDeps,
): Promise<AgentWorkflowResult> {
  "use step";

  configureTursoWorldEnv();

  if (deps !== undefined) {
    return runAgentWorkflow(params, deps);
  }

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

  await ensureDevAgentIdentity();

  return runAgentWorkflow(params, {
    chatService: getAgentChatService(),
    memoriesClient,
    khoraClient,
    embeddingModel: resolveHarnessEmbeddingModel(),
  });
}

export async function runAgentResponseStep(
  params: AgentWorkflowParams,
): Promise<AgentWorkflowResult> {
  "use step";

  configureTursoWorldEnv();

  const sessionId = params.context.sessionId;
  if (sessionId === undefined || sessionId.length === 0) {
    return executeAgentResponse(params);
  }

  const { resolveSwarmAgentWorkflowDeps } = await import("../../swarm/session-store.ts");
  const { resolveHarnessEmbeddingModel } = await import(
    "../tools/memories/_helpers/embedding-model.ts"
  );
  const swarmDeps = await resolveSwarmAgentWorkflowDeps(sessionId, params.agent.actingFor.id);
  return runAgentWorkflow(params, {
    chatService: swarmDeps.chatService,
    agentChat: swarmDeps.agentChat,
    sessionId: swarmDeps.sessionId,
    chatDb: swarmDeps.chatDb,
    memoriesClient: swarmDeps.memoriesClient,
    khoraClient: swarmDeps.khoraClient,
    embeddingModel: resolveHarnessEmbeddingModel(),
  });
}

export async function startAgentResponseWorkflow(
  params: AgentWorkflowParams,
): Promise<AgentWorkflowResult> {
  const run = await start(agentResponse, [params]);
  return run.returnValue as Promise<AgentWorkflowResult>;
}
