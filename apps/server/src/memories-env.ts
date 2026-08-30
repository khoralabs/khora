import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  createMemoriesEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingResolutionPreset,
  mergeResolutionAndProviderOptions,
} from "@khoralabs/memories-node/helpers";
import {
  KHORA_DOMUS_MEMORIES_DATABASE_ID,
  type KhoraDomusMemoriesDatabaseId,
} from "./memories-domus";
import type { KhoraPersistencePaths } from "./persistence-paths";

export const DEFAULT_HOST_SEARCH_NAMESPACE_ROOT = "global";

export type KhoraMemoriesBootstrapConfig = {
  /** memories-service local SQLite dataDir (`{KHORA_DATA_DIR}/memories`). */
  memoriesDataDir: string;
  databaseId: KhoraDomusMemoriesDatabaseId;
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

/** Default on when unset. Set `KHORA_MEMORIES=0` / `false` / `off` / `no` to disable. */
export function envMemoriesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.KHORA_MEMORIES?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

export function readKhoraEmbeddingEnv(env: NodeJS.ProcessEnv = process.env): KhoraEmbeddingEnv {
  return {
    provider: env.KHORA_EMBEDDING_PROVIDER?.trim().toLowerCase(),
    model: env.KHORA_EMBEDDING_MODEL?.trim(),
    resolution: parseEmbeddingResolution(env.KHORA_EMBEDDING_RESOLUTION?.trim()),
    apiKey:
      env.KHORA_EMBEDDING_API_KEY?.trim() ||
      env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      env.GOOGLE_API_KEY?.trim() ||
      env.GEMINI_API_KEY?.trim(),
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

export function readKhoraMemoriesNamespaceRoot(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.KHORA_MEMORIES_NAMESPACE_ROOT?.trim();
  return raw !== undefined && raw.length > 0 ? raw : DEFAULT_HOST_SEARCH_NAMESPACE_ROOT;
}

export function envMemoriesBootstrapConfig(
  paths: Pick<KhoraPersistencePaths, "memoriesDataDir">,
  env: NodeJS.ProcessEnv = process.env,
): KhoraMemoriesBootstrapConfig | undefined {
  if (!envMemoriesEnabled(env)) {
    return undefined;
  }
  return {
    memoriesDataDir: paths.memoriesDataDir,
    databaseId: KHORA_DOMUS_MEMORIES_DATABASE_ID,
    namespaceRoot: readKhoraMemoriesNamespaceRoot(env),
    embeddingModel: createKhoraEmbeddingModelFromEnv(readKhoraEmbeddingEnv(env)),
  };
}

/** Reject removed `KHORA_MEMORIES_DB_PATH`; host memories use `{KHORA_DATA_DIR}/memories`. */
export function assertKhoraMemoriesDbPathUnset(env: NodeJS.ProcessEnv = process.env): void {
  const raw = env.KHORA_MEMORIES_DB_PATH?.trim();
  if (raw !== undefined && raw.length > 0) {
    throw new Error(
      'KHORA_MEMORIES_DB_PATH is no longer supported; unset it. Host memories use {KHORA_DATA_DIR}/memories (database id { kind: "host", ownerKey: "khora" }).',
    );
  }
}
