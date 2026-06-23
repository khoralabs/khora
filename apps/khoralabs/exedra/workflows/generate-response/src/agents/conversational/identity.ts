import { createRegisteredAgent, type RegisteredAgent } from "@khoralabs/agent-capabilities";

import { type SkillRecord, skillStaticManifest } from "../../skills/registry.ts";
import { memoryToolkit } from "../../tools/memory-toolkit.ts";

export const CONVERSATIONAL_AGENT_ID = "generate-response-conversational-agent";

const baseInstructions = [
  "Use caller-provided directives, activated skills, available tools, and conversation context to generate the next response.",
  "Skills provide specialized instructions. The runtime will disclose the skills available for this invocation. Full skill instructions are only available after explicit activation or by calling activateSkill.",
];

export async function defineConversationalAgent(
  skills: SkillRecord[],
): Promise<{ staticHash: string; agent: RegisteredAgent }> {
  const staticManifest = skillStaticManifest(skills);
  const { staticHash, agent } = await createRegisteredAgent({
    agentId: CONVERSATIONAL_AGENT_ID,
    name: "Generate Response Conversational Agent",
    instructions: [
      ...baseInstructions,
      `Installed skill manifest for static capability hashing: ${staticManifest}`,
    ],
    context: {
      role: "generate-response-conversational-agent",
      skillStaticManifest: staticManifest,
    },
    rootComposable: memoryToolkit,
  });
  return { staticHash, agent };
}
