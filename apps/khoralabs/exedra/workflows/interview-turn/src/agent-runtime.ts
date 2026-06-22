import { createOpenAI } from "@ai-sdk/openai";
import { type AgentRegistry, createAgentRegistry } from "@khoralabs/agent-capabilities";
import type { LanguageModel } from "ai";

let agentRegistry: AgentRegistry | undefined;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

export function getAgentRegistry(): AgentRegistry {
  if (agentRegistry === undefined) agentRegistry = createAgentRegistry();
  return agentRegistry;
}

export function resolveInterviewModel(): LanguageModel {
  const apiKey = requireEnv("AI_API_KEY");
  const baseURL = process.env.AI_BASE_URL?.trim();
  const modelId = process.env.AI_MODEL?.trim() || "gpt-4o";
  const openai = createOpenAI({
    apiKey,
    ...(baseURL !== undefined && baseURL.length > 0 ? { baseURL } : {}),
  });
  return openai(modelId);
}
