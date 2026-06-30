import { createRegisteredAgent, type RegisteredAgent } from "@khoralabs/agent-capabilities";

import { harnessMemoryToolkit } from "../tools/index.ts";

export const HARNESS_AGENT_ID = "network-harness-agent";

export type HarnessAgentDefinition = {
  staticHash: string;
  agent: RegisteredAgent;
};

export async function defineHarnessAgent(): Promise<HarnessAgentDefinition> {
  const { staticHash, agent } = await createRegisteredAgent({
    agentId: HARNESS_AGENT_ID,
    name: "Network Harness Agent",
    instructions: [
      "Respond helpfully based on the conversation context.",
      "Use searchMemories to recall relevant context from the agent's memory database.",
      "Use writeMemory to persist notes and observations in an appropriate namespace.",
      "Use writeSkill to author skills in the skills namespace (alias for a structured memory write).",
      "Use activateSkill to load specialized instructions from skills stored in the skills namespace.",
    ],
    context: { role: "network-harness-agent" },
    rootComposable: harnessMemoryToolkit,
  });
  return { staticHash, agent };
}
