import type { RegisteredAgent } from "@khoralabs/agent-capabilities";
import type { SkillRecord } from "../skills/registry.ts";
import { defineConversationalAgent } from "./conversational/identity.ts";

export type GenerateResponseAgentDefinition = {
  staticHash: string;
  agent: RegisteredAgent;
};

export async function defineGenerateResponseAgent(
  skills: SkillRecord[],
): Promise<GenerateResponseAgentDefinition> {
  return defineConversationalAgent(skills);
}
