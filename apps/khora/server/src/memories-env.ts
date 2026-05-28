import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  createMemoriesEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingResolutionPreset,
  mergeResolutionAndProviderOptions,
} from "@khoralabs/memories-core/helpers";

export const DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT = "global";

export type KhoraMemoriesBootstrapConfig = {
  dbPath: string;
  embeddingModel?: EmbeddingModel;
  namespaceRoot?: string;
};

export type KhoraEmbeddingEnv = {
  provider?: string;
  model?: string;
  resolution?: EmbeddingResolutionPreset;
  apiKey?: string;
};

function parseEmbeddingResolution(raw: string | undefined): EmbeddingResolutionPreset | undefined {
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const u = raw.trim().toUpperCase();
  if (u === "L" || u === "M" || u === "H") return u;
  return undefined;
}

export function readKhoraEmbeddingEnv(): KhoraEmbeddingEnv {
  return {
    provider: process.env.KHORA_EMBEDDING_PROVIDER?.trim().toLowerCase(),
    model: process.env.KHORA_EMBEDDING_MODEL?.trim(),
    resolution: parseEmbeddingResolution(process.env.KHORA_EMBEDDING_RESOLUTION?.trim()),
    apiKey:
      process.env.KHORA_EMBEDDING_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim(),
  };
}

export function createKhoraEmbeddingModelFromEnv(
  env: KhoraEmbeddingEnv = readKhoraEmbeddingEnv(),
): EmbeddingModel | undefined {
  const provider = env.provider ?? "google";
  if (provider !== "google") {
    throw new Error(
      `KHORA_EMBEDDING_PROVIDER=${provider} is not supported yet; use google or omit for lexical-only`,
    );
  }
  const apiKey = env.apiKey;
  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }
  const modelId = env.model ?? "gemini-embedding-2-preview";
  const resolution = env.resolution ?? "M";
  const google = createGoogleGenerativeAI({ apiKey });
  return createMemoriesEmbeddingModel({
    model: google.embedding(modelId),
    providerOptions: mergeResolutionAndProviderOptions(resolution),
  });
}

export function readKhoraMemoriesNamespaceRoot(): string {
  const raw = process.env.KHORA_MEMORIES_NAMESPACE_ROOT?.trim();
  return raw !== undefined && raw.length > 0 ? raw : DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT;
}

export function envMemoriesBootstrapConfig(): KhoraMemoriesBootstrapConfig | undefined {
  const dbPath = process.env.KHORA_MEMORIES_DB_PATH?.trim();
  if (dbPath === undefined || dbPath.length === 0) return undefined;
  return {
    dbPath,
    namespaceRoot: readKhoraMemoriesNamespaceRoot(),
    embeddingModel: createKhoraEmbeddingModelFromEnv(),
  };
}
