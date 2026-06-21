import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  createMemoriesEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingResolutionPreset,
  mergeResolutionAndProviderOptions,
} from "@khoralabs/memories-core/helpers";

const EMBEDDING_DIM_BY_PRESET = { L: 768, M: 1536, H: 3072 } as const;

export function resolveGeminiApiKey(): string | undefined {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    undefined
  );
}

function parseExplicitEmbeddingPreset(value: string | undefined): EmbeddingResolutionPreset | null {
  if (value === undefined) return null;
  const upper = value.trim().toUpperCase();
  if (upper === "L" || upper === "M" || upper === "H") return upper;
  return null;
}

export function resolveDocumentEmbeddingPreset(): EmbeddingResolutionPreset {
  return parseExplicitEmbeddingPreset(process.env.MEMORIES_SEARCH_EMBEDDING_PRESET?.trim()) ?? "M";
}

export function createExedraMemoriesEmbeddingModel(): EmbeddingModel {
  const apiKey = resolveGeminiApiKey();
  if (apiKey === undefined) {
    throw new Error(
      "Google API key required for document embeddings (GOOGLE_GENERATIVE_AI_API_KEY)",
    );
  }

  const preset = resolveDocumentEmbeddingPreset();
  const google = createGoogleGenerativeAI({ apiKey });
  return createMemoriesEmbeddingModel({
    model: google.embedding("gemini-embedding-2-preview"),
    providerOptions: mergeResolutionAndProviderOptions(preset),
  });
}

export function providerOptionsForDocumentEmbeddingPreset(preset: EmbeddingResolutionPreset) {
  return { google: { outputDimensionality: EMBEDDING_DIM_BY_PRESET[preset] } };
}
