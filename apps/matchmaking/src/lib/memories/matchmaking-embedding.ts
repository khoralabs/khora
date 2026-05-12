import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  createMemoriesEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingResolutionPreset,
  mergeResolutionAndProviderOptions,
} from "@khoralabs/memories-core/helpers";
import { resolveGeminiApiKey } from "../matchmaking-obp/index.ts";

let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;

function getGoogle(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!google) {
    google = createGoogleGenerativeAI({ apiKey: resolveGeminiApiKey() });
  }
  return google;
}

const embeddingByResolution = new Map<EmbeddingResolutionPreset, EmbeddingModel>();

/** Default M resolution; shared with matchmaking session + persona seeding. */
export function getMatchmakingEmbeddingModel(
  resolution: EmbeddingResolutionPreset = "M",
): EmbeddingModel {
  let m = embeddingByResolution.get(resolution);
  if (!m) {
    m = createMemoriesEmbeddingModel({
      model: getGoogle().embeddingModel("gemini-embedding-2-preview"),
      providerOptions: mergeResolutionAndProviderOptions(resolution),
    });
    embeddingByResolution.set(resolution, m);
  }
  return m;
}
