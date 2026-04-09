import {
  createPartFromBase64,
  createPartFromText,
  type EmbedContentConfig,
  GoogleGenAI,
} from "@google/genai";
import { logger } from "../logger.js";
import { elapsedMs } from "../timing.js";

export const EMBEDDING_MODEL_NAME = "gemini-embedding-2-preview";
export const GOOGLE_EMBED_BATCH_SIZE = 100;
export const MAX_TEXT_CHUNK_CHARS = 2_000;

/**
 * Common output dimensionalities for Gemini embedding models (`outputDimensionality` in {@link EmbedContentConfig}).
 * Callers can pick a recipe and pass {@link EmbeddingModelOptions.embedConfig}.
 */
export const EMBEDDING_OUTPUT_DIMENSIONALITY = {
  L: 768,
  M: 1536,
  H: 3072,
} as const;

export type EmbeddingResolutionPreset = keyof typeof EMBEDDING_OUTPUT_DIMENSIONALITY;

/** `EmbedContentConfig` with `outputDimensionality` set for a preset (L/M/H). */
export function embedConfigForResolutionPreset(preset: EmbeddingResolutionPreset): EmbedContentConfig {
  return { outputDimensionality: EMBEDDING_OUTPUT_DIMENSIONALITY[preset] };
}

export interface EmbeddingModelOptions {
  apiKey?: string;
  model?: string;
  textBatchSize?: number;
  /** Merged into every `embedContent` call (e.g. `outputDimensionality`). */
  embedConfig?: EmbedContentConfig;
}

export interface EmbeddingModel {
  readonly client: GoogleGenAI;
  readonly model: string;
  readonly textBatchSize: number;
  /** Merged last with per-call overrides in {@link embedTextChunks} / {@link embedBinaryBlob}. */
  readonly embedConfig?: EmbedContentConfig;
}

export interface BinaryEmbedInput {
  blob: Blob;
  mimeType: string;
  retrievalText: string;
}

export function createEmbeddingModel(options: EmbeddingModelOptions = {}): EmbeddingModel {
  const apiKey =
    options.apiKey?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  return {
    client: new GoogleGenAI(apiKey ? { apiKey } : {}),
    model: options.model ?? EMBEDDING_MODEL_NAME,
    textBatchSize: options.textBatchSize ?? GOOGLE_EMBED_BATCH_SIZE,
    ...(options.embedConfig !== undefined ? { embedConfig: options.embedConfig } : {}),
  };
}

function mergeEmbedConfig(
  model: EmbeddingModel,
  override?: EmbedContentConfig,
): EmbedContentConfig {
  return { ...model.embedConfig, ...override };
}

function normalizeEmbeddingValues(
  embeddings: Array<{ values?: number[] } | null | undefined> | undefined,
): number[][] {
  return (embeddings ?? []).flatMap((embedding) =>
    embedding?.values?.length ? [embedding.values] : [],
  );
}

export async function embedTextChunks(
  embeddingModel: EmbeddingModel,
  texts: readonly string[],
  config: EmbedContentConfig = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const t0 = performance.now();
  const mergedConfig = mergeEmbedConfig(embeddingModel, config);
  const out: number[][] = [];
  for (let batchStart = 0; batchStart < texts.length; batchStart += embeddingModel.textBatchSize) {
    const batch = texts.slice(batchStart, batchStart + embeddingModel.textBatchSize);
    const response = await embeddingModel.client.models.embedContent({
      model: embeddingModel.model,
      contents: [...batch],
      ...(Object.keys(mergedConfig).length > 0 ? { config: mergedConfig } : {}),
    });
    const embeddings = normalizeEmbeddingValues(response.embeddings);
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Google embedContent: expected ${batch.length} embeddings, got ${embeddings.length}`,
      );
    }
    out.push(...embeddings);
  }

  logger.debug({
    phase: "embedTextChunks",
    durationMs: elapsedMs(t0),
    textCount: texts.length,
    model: embeddingModel.model,
  });
  return out;
}

export async function embedBinaryBlob(
  embeddingModel: EmbeddingModel,
  input: BinaryEmbedInput,
  config: EmbedContentConfig = {},
): Promise<number[]> {
  const t0 = performance.now();
  const mergedConfig = mergeEmbedConfig(embeddingModel, config);
  const fileBase64 = Buffer.from(await input.blob.arrayBuffer()).toString("base64");
  const response = await embeddingModel.client.models.embedContent({
    model: embeddingModel.model,
    contents: [
      createPartFromBase64(fileBase64, input.mimeType),
      createPartFromText(input.retrievalText),
    ],
    ...(Object.keys(mergedConfig).length > 0 ? { config: mergedConfig } : {}),
  });
  const embeddings = normalizeEmbeddingValues(response.embeddings);
  const first = embeddings[0];
  if (!first) {
    throw new Error("Google did not return any embeddings");
  }
  logger.debug({
    phase: "embedBinaryBlob",
    durationMs: elapsedMs(t0),
    model: embeddingModel.model,
  });
  return first;
}
