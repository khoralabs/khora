import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type AgentRegistry, createAgentRegistry } from "@khoralabs/agent-capabilities";
import type { ExedraHttpMemoriesClientAsync } from "@khoralabs/exedra-workflows-shared/http-memories-client-async";
import { createExedraHttpMemoriesClientAsync } from "@khoralabs/exedra-workflows-shared/http-memories-client-async";
import {
  createMemoriesEmbeddingModel,
  mergeResolutionAndProviderOptions,
} from "@khoralabs/memories-core/helpers";
import type { LanguageModel } from "ai";

let agentRegistry: AgentRegistry | undefined;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

export function resolveGeminiApiKey(): string {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("Google API key required (GOOGLE_GENERATIVE_AI_API_KEY)");
  }
  return apiKey;
}

function parseEmbeddingPreset(): "L" | "M" | "H" {
  const raw = process.env.MEMORIES_SEARCH_EMBEDDING_PRESET?.trim().toUpperCase();
  if (raw === "L" || raw === "M" || raw === "H") return raw;
  return "M";
}

export function getAgentRegistry(): AgentRegistry {
  if (agentRegistry === undefined) agentRegistry = createAgentRegistry();
  return agentRegistry;
}

export function resolveInvestigatorModel(): LanguageModel {
  const google = createGoogleGenerativeAI({ apiKey: resolveGeminiApiKey() });
  const modelId = process.env.MEMORIES_INVESTIGATOR_MODEL?.trim() || "gemini-flash-latest";
  return google.languageModel(modelId);
}

export function resolveEmbeddingModel() {
  const preset = parseEmbeddingPreset();
  const google = createGoogleGenerativeAI({ apiKey: resolveGeminiApiKey() });
  return createMemoriesEmbeddingModel({
    model: google.embedding("gemini-embedding-2-preview"),
    providerOptions: mergeResolutionAndProviderOptions(preset),
  });
}

export function resolveInvestigatorMaxSteps(): number {
  const raw = Number(process.env.MEMORIES_INVESTIGATOR_MAX_STEPS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.floor(raw)) : 12;
}

export function createRemoteMemoriesClient(
  userId: string,
  orgId?: string,
): ExedraHttpMemoriesClientAsync {
  return createExedraHttpMemoriesClientAsync({
    userId,
    orgId,
    baseUrl: requireEnv("EXEDRA_INTERNAL_URL"),
    token: requireEnv("EXEDRA_INTERNAL_TOKEN"),
  });
}
