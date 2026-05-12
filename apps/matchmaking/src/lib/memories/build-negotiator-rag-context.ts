import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import { embeddingCacheKey, embedTextChunks } from "@khoralabs/memories-tools";
import type { createMatchmakingMemoriesBundle } from "./create-memories-bundle.ts";

/** Align with post-negotiation summary excerpt sizing. */
const THREAD_EXCERPT_LEN = 1200;

const DEFAULT_TOP_K = 8;

function excerptThread(threadText: string): string {
  const t = threadText.trim();
  if (t.length <= THREAD_EXCERPT_LEN) {
    return t;
  }
  return `${t.slice(0, THREAD_EXCERPT_LEN)}…`;
}

async function embedWithCache(
  embeddingModel: EmbeddingModel,
  namespace: string,
  text: string,
  embeddingCache: Map<string, number[]> | undefined,
): Promise<number[] | undefined> {
  const cacheKey = embeddingCacheKey(namespace, text);
  const cached = embeddingCache?.get(cacheKey);
  if (cached) {
    return cached;
  }
  const embeddings = await embedTextChunks(embeddingModel, [text]);
  const vector = embeddings[0];
  if (vector !== undefined && vector.length > 0) {
    embeddingCache?.set(cacheKey, vector);
  }
  return vector;
}

export type BuildNegotiatorRagContextArgs = {
  client: ReturnType<typeof createMatchmakingMemoriesBundle>["client"];
  namespace: string;
  embeddingModel: EmbeddingModel;
  embeddingCache?: Map<string, number[]>;
  threadText: string;
  /** Passed through to hybrid search; omit for legacy behavior. */
  topK?: number;
  /** sqlite‑vec distance ceiling when supported by the client (noise filter). */
  maxVectorDistance?: number;
};

/**
 * Programmatic hybrid retrieval for a negotiator turn—same retrieval stack as `memory_search`,
 * without a tool loop. Safe for other matchmaking agents to reuse.
 *
 * Returns formatted markdown, or `null` if retrieval fails (caller should continue without RAG).
 */
export async function buildNegotiatorRagContext(
  args: BuildNegotiatorRagContextArgs,
): Promise<string | null> {
  try {
    const { client, namespace, embeddingModel, embeddingCache, threadText } = args;
    const topK = args.topK ?? DEFAULT_TOP_K;
    const excerpt = excerptThread(threadText);
    if (excerpt.length === 0) {
      return null;
    }

    const queries = [
      `${excerpt}\n\nRecall: goals, boundaries, and preferences relevant to this negotiation.`,
      `Negotiation-relevant memories and reflections for the current thread context.`,
    ];

    const searchOptions: {
      topK: number;
      neighbors: false;
      maxVectorDistance?: number;
    } = {
      topK,
      neighbors: false,
      ...(args.maxVectorDistance !== undefined
        ? { maxVectorDistance: args.maxVectorDistance }
        : {}),
    };

    const lines: string[] = [];
    const seenKeys = new Set<string>();

    for (const q of queries) {
      const text = q.trim();
      if (text.length === 0) continue;

      const vector = await embedWithCache(embeddingModel, namespace, text, embeddingCache);
      const content = vector !== undefined && vector.length > 0 ? { text, vector } : { text };
      const hits = client.search({
        namespace,
        content,
        options: searchOptions,
      });
      for (const h of hits) {
        const key = h.memory.key;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const labelStr = h.labels.map((l) => l.kind).join(", ");
        lines.push(
          `- **${key}** (${h.source_key}, score ${h.score.toFixed(3)}): labels [${labelStr}]`,
        );
      }
    }

    if (lines.length === 0) {
      return "(No memory hits for this thread excerpt in your namespace; use **memory_search** only if you need a narrower follow-up query.)";
    }

    return [
      "Retrieved rows (do not invent facts beyond these, the fixed profile, and the thread):",
      ...lines,
    ].join("\n");
  } catch (e) {
    console.warn("[matchmaking] buildNegotiatorRagContext failed:", e);
    return null;
  }
}
