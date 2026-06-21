import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type AgentRegistry, createAgentRegistry } from "@khoralabs/agent-capabilities";
import {
  createMemoriesEmbeddingModel,
  mergeResolutionAndProviderOptions,
} from "@khoralabs/memories-core/helpers";
import type { LanguageModel } from "ai";
import type { ExedraHttpMemoriesClientAsync } from "./http-memories-client-async.ts";
import { createExedraHttpMemoriesClientAsync } from "./http-memories-client-async.ts";

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

export function resolveChatModel(): LanguageModel {
  const google = createGoogleGenerativeAI({ apiKey: resolveGeminiApiKey() });
  const modelId = process.env.MEMORIES_INTEGRATOR_MODEL?.trim() || "gemini-2.0-flash";
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

export function resolveAdapterMaxSteps(): number {
  const raw = Number(process.env.MEMORIES_BELIEF_ADAPTER_MAX_STEPS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.floor(raw)) : 4;
}

export function resolveIntegratorMaxSteps(): number {
  const raw = Number(process.env.MEMORIES_BELIEF_INTEGRATOR_MAX_STEPS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.floor(raw)) : 4;
}

export function createRemoteMemoriesClient(userId: string): ExedraHttpMemoriesClientAsync {
  return createExedraHttpMemoriesClientAsync({
    userId,
    baseUrl: requireEnv("EXEDRA_INTERNAL_URL"),
    token: requireEnv("EXEDRA_INTERNAL_TOKEN"),
  });
}
