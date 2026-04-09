import type { MergeMemoryContentItem } from "@cfd/memories";
import {
  createEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingModelOptions,
  fileToContent,
  textToContent,
} from "../adapters";

/** One logical memory: optional plaintext and/or multiple files; embedding decomposes into many merge chunks. */
export interface LogicalMemoryFilePart {
  blob: Blob;
  mimeType?: string;
  fileName?: string | null;
  title?: string;
  fallbackText?: string;
}

export interface LogicalMemoryInput {
  /** Target memory key for {@link mergeMemory}. */
  key: string;
  namespace: string;
  plaintext?: string;
  files?: LogicalMemoryFilePart[];
  /** Passed to {@link createEmbeddingModel} and adapters (including `embedConfig` / resolution). */
  embedding?: EmbeddingModelOptions & { embeddingModel?: EmbeddingModel };
}

export interface ProcessedLogicalMemory extends LogicalMemoryInput {
  content: MergeMemoryContentItem[];
}

/**
 * Runs the embedding adapters: plaintext (if any) plus each file, with stable key prefixes
 * (`text:*`, `file:i:*`), then concatenates into one `content` array for a single merge.
 */
export async function decomposeLogicalMemoryToContent(
  input: LogicalMemoryInput,
): Promise<MergeMemoryContentItem[]> {
  const embeddingModel =
    input.embedding?.embeddingModel ??
    createEmbeddingModel({
      apiKey: input.embedding?.apiKey,
      model: input.embedding?.model,
      textBatchSize: input.embedding?.textBatchSize,
      embedConfig: input.embedding?.embedConfig,
    });

  const out: MergeMemoryContentItem[] = [];

  if (input.plaintext?.trim()) {
    const r = await textToContent({
      text: input.plaintext.trim(),
      embeddingModel,
      keyPrefix: "text",
    });
    out.push(...r.content);
  }

  if (input.files?.length) {
    for (let i = 0; i < input.files.length; i++) {
      const f = input.files[i];
      if (f === undefined) continue;
      const r = await fileToContent({
        blob: f.blob,
        mimeType: f.mimeType,
        fileName: f.fileName,
        title: f.title,
        fallbackText: f.fallbackText,
        embeddingModel,
        keyPrefix: `file:${i}`,
      });
      out.push(...r.content);
    }
  }

  if (out.length === 0) {
    throw new Error("Logical memory has no plaintext or files to embed");
  }

  return out;
}
