import { createRegisteredAgent, type RegisteredAgent } from "@khoralabs/agent-capabilities";

import { emptyToolkit } from "../tools/index.ts";

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
      "You may use the chat thread to think out loud when no other participants are present.",
    ],
    context: { role: "network-harness-agent" },
    rootComposable: emptyToolkit,
  });
  return { staticHash, agent };
}
