import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  createMemoriesEmbeddingModel,
  fileToContent,
  isTextLikeMime,
  mergeResolutionAndProviderOptions,
  textToContent,
} from "@khoralabs/memories-core/helpers";
import type { ProcessDocumentParams } from "../../../shared/document-processing.js";
import { resolveDocumentMemoryKey } from "../../../shared/document-processing.js";
import {
  fetchDocumentBytes,
  fetchDocumentMeta,
  patchDocument,
  postMergeDocumentChunk,
} from "./exedra-client.js";
import { summarizeDocumentBytes } from "./summarize-document.js";

function resolveGeminiApiKey(): string {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("Google API key required (GOOGLE_GENERATIVE_AI_API_KEY)");
  }
  return apiKey;
}

function resolveEmbeddingModel() {
  const presetRaw = process.env.MEMORIES_SEARCH_EMBEDDING_PRESET?.trim().toUpperCase();
  const preset = presetRaw === "L" || presetRaw === "M" || presetRaw === "H" ? presetRaw : "M";
  const google = createGoogleGenerativeAI({ apiKey: resolveGeminiApiKey() });
  return createMemoriesEmbeddingModel({
    model: google.embedding("gemini-embedding-2-preview"),
    providerOptions: mergeResolutionAndProviderOptions(preset),
  });
}

export async function processDocument(params: ProcessDocumentParams): Promise<void> {
  const document = await fetchDocumentMeta(params.documentId);
  const bytes = await fetchDocumentBytes(params.documentId);
  const embeddingModel = resolveEmbeddingModel();

  const summary = await summarizeDocumentBytes({
    fileName: document.fileName,
    mimeType: document.mimeType,
    bytes,
  }).catch(() => null);

  const blob = new Blob([new Uint8Array(bytes)], { type: document.mimeType });
  const sourceProperties = {
    sourceApp: "exedra",
    sessionId: params.sessionId,
    documentId: params.documentId,
    fileName: document.fileName,
    mimeType: document.mimeType,
    uploadedByUserId: document.uploadedByUserId,
  };

  if (isTextLikeMime(document.mimeType)) {
    const text = await blob.text();
    const embedded = await textToContent({
      text,
      retrievalText: text,
      embeddingModel,
      keyPrefix: "chunk",
    });

    for (let index = 0; index < embedded.content.length; index++) {
      const chunk = embedded.content[index];
      if (chunk === undefined) continue;
      const memoryKey = resolveDocumentMemoryKey(params.sessionId, params.documentId, index);
      const chunkText = chunk.text ?? embedded.retrievalText;
      await postMergeDocumentChunk({
        userId: params.userId,
        memoryKey,
        plaintext: chunkText,
        content: [{ key: chunk.key, text: chunk.text, vector: chunk.vector ?? [] }],
        properties: sourceProperties,
      });
    }
  } else {
    const embedded = await fileToContent({
      blob,
      mimeType: document.mimeType,
      fileName: document.fileName,
      title: document.fileName,
      fallbackText: summary ?? undefined,
      embeddingModel,
      multimodal: true,
      keyPrefix: "binary",
    });
    const memoryKey = resolveDocumentMemoryKey(params.sessionId, params.documentId);
    await postMergeDocumentChunk({
      userId: params.userId,
      memoryKey,
      plaintext: embedded.retrievalText,
      content: embedded.content.map((item) => ({
        key: item.key,
        ...(item.text !== undefined ? { text: item.text } : {}),
        vector: item.vector ?? [],
      })),
      properties: sourceProperties,
    });
  }

  await patchDocument(params.documentId, {
    status: "ready",
    summary,
    processedAtMs: Date.now(),
  });
}
