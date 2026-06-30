import { getAgentChatService } from "../chat-service.ts";
import { runAgentWorkflow } from "../run-agent-workflow.ts";
import type { AgentWorkflowParams, AgentWorkflowResult } from "../types.ts";
import { configureTursoWorldEnv } from "../world.ts";

export async function agentResponse(params: AgentWorkflowParams): Promise<AgentWorkflowResult> {
  "use workflow";

  return await executeAgentResponse(params);
}

async function executeAgentResponse(params: AgentWorkflowParams): Promise<AgentWorkflowResult> {
  "use step";

  configureTursoWorldEnv();
  return runAgentWorkflow(params, { chatService: getAgentChatService() });
}
