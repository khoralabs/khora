import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { embedMany } from "ai";
import type { EmbeddingModel } from "./embedding-types.js";

function mergeProviderOptions(
  ...parts: (ProviderOptions | undefined)[]
): ProviderOptions | undefined {
  let acc: ProviderOptions | undefined;
  for (const p of parts) {
    if (!p) continue;
    if (!acc) {
      acc = { ...p };
      continue;
    }
    const out: Record<string, unknown> = { ...acc };
    for (const [k, v] of Object.entries(p)) {
      const ak = out[k];
      if (
        ak &&
        v &&
        typeof ak === "object" &&
        typeof v === "object" &&
        !Array.isArray(ak) &&
        !Array.isArray(v)
      ) {
        out[k] = { ...(ak as Record<string, unknown>), ...(v as Record<string, unknown>) };
      } else {
        out[k] = v;
      }
    }
    acc = out as ProviderOptions;
  }
  return acc;
}

export async function embedTextChunks(
  embeddingModel: EmbeddingModel,
  texts: readonly string[],
  callOptions?: { providerOptions?: ProviderOptions; abortSignal?: AbortSignal },
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const mergedBase = mergeProviderOptions(
    embeddingModel.providerOptions,
    callOptions?.providerOptions,
  );
  const out: number[][] = [];
  const { textBatchSize, maxParallelCalls, model } = embeddingModel;

  for (let batchStart = 0; batchStart < texts.length; batchStart += textBatchSize) {
    const batch = texts.slice(batchStart, batchStart + textBatchSize);
    const { embeddings } = await embedMany({
      model,
      values: [...batch],
      maxParallelCalls,
      providerOptions: mergedBase,
      abortSignal: callOptions?.abortSignal,
    });
    if (embeddings.length !== batch.length) {
      throw new Error(`embedMany: expected ${batch.length} embeddings, got ${embeddings.length}`);
    }
    out.push(...embeddings);
  }

  return out;
}
