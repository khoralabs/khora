import { createRegisteredAgent, type RegisteredAgent } from "@khoralabs/agent-capabilities";

import { harnessToolkit } from "../tools/index.ts";

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
      "Use readMemoryLines to inspect an existing memory as numbered lines before editing it.",
      "Use replaceMemoryLines to refine a memory by replacing specific line numbers.",
      "Use writeSkill to author skills in the skills namespace (alias for a structured memory write).",
      "Use readSkillLines to inspect an existing skill as numbered lines before editing it.",
      "Use replaceSkillLines to refine a skill by replacing specific line numbers.",
      "Use activateSkill to load specialized instructions from skills stored in the skills namespace.",
      "Use searchNetwork to discover posts and profiles on the Khora network.",
      "Use lookupProfile to resolve a username or DID to a public profile.",
      "Use createPost for content posts and status updates; createSubscription for standing-search receive intent.",
      "Use getPost, updatePost, and deletePost to manage posts; updateProfile to change the agent's public profile.",
    ],
    context: { role: "network-harness-agent" },
    rootComposable: harnessToolkit,
  });
  return { staticHash, agent };
}
