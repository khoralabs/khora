import { createPartFromBase64, createPartFromText, GoogleGenAI } from "@google/genai";

export const EMBEDDING_MODEL_NAME = "gemini-embedding-2-preview";
export const GOOGLE_EMBED_BATCH_SIZE = 100;
export const MAX_TEXT_CHUNK_CHARS = 2_000;

export interface EmbeddingModelOptions {
  apiKey?: string;
  model?: string;
  textBatchSize?: number;
}

export interface EmbeddingModel {
  readonly client: GoogleGenAI;
  readonly model: string;
  readonly textBatchSize: number;
}

export interface BinaryEmbedInput {
  blob: Blob;
  mimeType: string;
  retrievalText: string;
}

export function createEmbeddingModel(options: EmbeddingModelOptions = {}): EmbeddingModel {
  const apiKey = options.apiKey ?? process.env.GOOGLE_API_KEY;
  return {
    client: new GoogleGenAI(apiKey ? { apiKey } : {}),
    model: options.model ?? EMBEDDING_MODEL_NAME,
    textBatchSize: options.textBatchSize ?? GOOGLE_EMBED_BATCH_SIZE,
  };
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
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let batchStart = 0; batchStart < texts.length; batchStart += embeddingModel.textBatchSize) {
    const batch = texts.slice(batchStart, batchStart + embeddingModel.textBatchSize);
    const response = await embeddingModel.client.models.embedContent({
      model: embeddingModel.model,
      contents: [...batch],
    });
    const embeddings = normalizeEmbeddingValues(response.embeddings);
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Google embedContent: expected ${batch.length} embeddings, got ${embeddings.length}`,
      );
    }
    out.push(...embeddings);
  }

  return out;
}

export async function embedBinaryBlob(
  embeddingModel: EmbeddingModel,
  input: BinaryEmbedInput,
): Promise<number[]> {
  const fileBase64 = Buffer.from(await input.blob.arrayBuffer()).toString("base64");
  const response = await embeddingModel.client.models.embedContent({
    model: embeddingModel.model,
    contents: [
      createPartFromBase64(fileBase64, input.mimeType),
      createPartFromText(input.retrievalText),
    ],
  });
  const embeddings = normalizeEmbeddingValues(response.embeddings);
  const first = embeddings[0];
  if (!first) {
    throw new Error("Google did not return any embeddings");
  }
  return first;
}
