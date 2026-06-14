import { type AgentRegistry, createAgentRegistry } from "@khoralabs/agent-capabilities";

let agentRegistry: AgentRegistry | undefined;

export function getAgentRegistry(): AgentRegistry {
  if (agentRegistry === undefined) {
    agentRegistry = createAgentRegistry();
  }
  return agentRegistry;
}
