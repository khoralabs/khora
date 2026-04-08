import type { MergeMemoryContentItem } from "@cfd/memories";
import {
  createEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingModelOptions,
  embedBinaryBlob,
} from "./embedding-model";
import { textToContent } from "./text-to-content";

export interface FileToContentInput extends EmbeddingModelOptions {
  blob: Blob;
  mimeType?: string;
  fileName?: string | null;
  title?: string;
  fallbackText?: string;
  keyPrefix?: string;
  embeddingModel?: EmbeddingModel;
}

export interface FileToContentResult {
  kind: "text-file" | "binary-file";
  mimeType: string;
  isTextLike: boolean;
  fileName?: string | null;
  title?: string;
  retrievalText: string;
  lexicalText?: string;
  chunkCount: number;
  content: MergeMemoryContentItem[];
}

/** MIME types commonly supported for multimodal Gemini embedding inputs (non-text path uses raw bytes). */
export const GEMINI_EMBEDDING_SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "video/mpeg",
  "video/mp4",
  "audio/mp3",
  "audio/wav",
] as const;

export function isGeminiMultimodalEmbeddingMime(mimeType: string): boolean {
  return (GEMINI_EMBEDDING_SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isTextLikeMime(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/yaml" ||
    mimeType === "text/markdown" ||
    mimeType === "application/javascript"
  );
}

export function buildRetrievalText(args: {
  text?: string;
  title?: string;
  fileName?: string | null;
  mimeType: string;
  fallbackText?: string;
}): string {
  const text = args.text?.trim();
  if (text) return text;

  const fallbackText = args.fallbackText?.trim();
  if (fallbackText) return fallbackText;

  return (
    [args.title, args.fileName, args.mimeType].filter(Boolean).join(" ").trim() || "binary file"
  );
}

export async function fileToContent(input: FileToContentInput): Promise<FileToContentResult> {
  const mimeType = (input.mimeType ?? input.blob.type) || "application/octet-stream";
  const embeddingModel =
    input.embeddingModel ??
    createEmbeddingModel({
      apiKey: input.apiKey,
      model: input.model,
      textBatchSize: input.textBatchSize,
    });

  if (isTextLikeMime(mimeType)) {
    const text = (await input.blob.text()).trim();
    const retrievalText = buildRetrievalText({
      text,
      title: input.title,
      fileName: input.fileName,
      mimeType,
      fallbackText: input.fallbackText,
    });
    const result = await textToContent({
      embeddingModel,
      text,
      retrievalText,
      lexicalText: retrievalText,
      keyPrefix: input.keyPrefix ?? "chunk",
    });
    return {
      kind: "text-file",
      mimeType,
      isTextLike: true,
      fileName: input.fileName,
      title: input.title,
      retrievalText: result.retrievalText,
      lexicalText: result.lexicalText,
      chunkCount: result.chunkCount,
      content: result.content,
    };
  }

  const retrievalText = buildRetrievalText({
    title: input.title,
    fileName: input.fileName,
    mimeType,
    fallbackText: input.fallbackText,
  });
  const vector = await embedBinaryBlob(embeddingModel, {
    blob: input.blob,
    mimeType,
    retrievalText,
  });
  const content: MergeMemoryContentItem[] = [
    {
      key: `${input.keyPrefix ?? "binary"}:0`,
      vector,
    },
  ];

  return {
    kind: "binary-file",
    mimeType,
    isTextLike: false,
    fileName: input.fileName,
    title: input.title,
    retrievalText,
    chunkCount: content.length,
    content,
  };
}
