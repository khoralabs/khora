/** Minimal embedding model shape for hybrid search query vectors (AI SDK `embedMany`). */

import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { EmbeddingModel as AiSdkEmbeddingModel } from "ai";

export type { ProviderOptions } from "@ai-sdk/provider-utils";

export interface EmbeddingModel {
  readonly model: AiSdkEmbeddingModel;
  readonly textBatchSize: number;
  readonly maxParallelCalls?: number;
  readonly providerOptions?: ProviderOptions;
}

export function aiSdkEmbeddingModelId(m: AiSdkEmbeddingModel): string {
  if (typeof m === "string") {
    const s = m.trim();
    const slash = s.lastIndexOf("/");
    return slash >= 0 ? s.slice(slash + 1) : s;
  }
  if (
    typeof m === "object" &&
    m !== null &&
    "modelId" in m &&
    typeof (m as { modelId: unknown }).modelId === "string"
  ) {
    return (m as { modelId: string }).modelId;
  }
  return "";
}
