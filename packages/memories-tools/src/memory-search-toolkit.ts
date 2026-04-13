import { logger, tool, toolkit } from "@cfd/agent-identity";
import type {
  MemoriesClient,
  MemoriesClientAsync,
  NeighborSearchOption,
  SearchContent,
  SearchHit,
} from "@cfd/memories-core";
import z from "zod";
import { embedTextChunks } from "./embedding-text.js";
import type { EmbeddingModel } from "./embedding-types.js";
import { memoriesLog, memoriesLogToolBodies } from "./telemetry.js";
import { elapsedMs } from "./timing.js";

/** Wide ontology maps; session clients use narrower TNode/TEdge at runtime (see {@link toMemorySearchEnv}). */
export type MemorySearchWideClient = MemoriesClient<
  Record<string, z.ZodType>,
  Record<string, z.ZodType>
>;

export type MemorySearchWideClientAsync = MemoriesClientAsync<
  Record<string, z.ZodType>,
  Record<string, z.ZodType>
>;

/** Per-session embedding cache for identical query strings (see {@link MemorySearchEnv.embeddingCache}). */
export function embeddingCacheKey(namespace: string, queryText: string): string {
  return `${namespace}\n${queryText.trim()}`;
}

/**
 * Slim tool result for the LLM (keys, scores, labels) — avoids serializing full {@link SearchHit} rows.
 * Neighbor rows are capped when present.
 */
export type MemorySearchHit = {
  memory_key: string;
  score: number;
  labels: string[];
  source_key: string;
  neighbors?: Array<{ memory_key: string; labels: string[] }>;
};

const MAX_NEIGHBORS_PER_HIT = 8;

function mapSearchHit(hit: SearchHit): MemorySearchHit {
  const row: MemorySearchHit = {
    memory_key: hit.memory.key,
    score: hit.score,
    labels: [...hit.labels],
    source_key: hit.source_key,
  };
  if (hit.neighbors?.length) {
    row.neighbors = hit.neighbors.slice(0, MAX_NEIGHBORS_PER_HIT).map((n) => ({
      memory_key: n.key,
      labels: [...n.labels],
    }));
  }
  return row;
}

function mapSearchHits(hits: SearchHit[]): MemorySearchHit[] {
  return hits.map(mapSearchHit);
}

function truncateForLog(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/** Runtime env for {@link memorySearchToolkit}: client, namespace, and embedding model (injected; not tool args). */
export type MemorySearchEnv = {
  client: MemorySearchWideClient | MemorySearchWideClientAsync;
  namespace: string;
  /** Used to embed `content.text` for the vector retrieval arm (same model as ingestion). */
  embeddingModel: EmbeddingModel;
  /**
   * Optional per-session cache for query embedding vectors (same normalized key as {@link embeddingCacheKey}).
   * Instantiated in {@link buildMemorySearchToolkitContext}.
   */
  embeddingCache?: Map<string, number[]>;
};

/** Agent passes query text only; the handler embeds it and runs hybrid RRF (lexical + vector). */
const zSearchContent = z
  .object({
    text: z.string().describe("Query string for FTS + embedding (no raw vector)."),
  })
  .strict();

const zNeighborNodesFilter = z
  .object({
    all: z.array(z.string()).optional().describe("Neighbor node labels: AND."),
    some: z.array(z.string()).optional().describe("Neighbor node labels: OR."),
  })
  .describe("Filter neighbor memory node labels.");

const zNeighborConstraint = z.object({
  label: z.string().describe("Edge label kind for neighbor expansion."),
  direction: z.enum(["in", "out"]).optional(),
  nodes: zNeighborNodesFilter.optional(),
});

const zMemorySearchOptions = z
  .object({
    topK: z.number().int().positive().optional().describe("Max hits after fusion."),
    minScore: z.number().optional().describe("Min fused score."),
    labels: z
      .object({
        all: z.array(z.string()).optional().describe("Root hit: node labels AND."),
        some: z.array(z.string()).optional().describe("Root hit: node labels OR."),
      })
      .optional(),
    neighbors: z
      .union([
        z.literal("all").describe("All depth-1 neighbors."),
        z.literal("off").describe("No neighbors."),
        z
          .object({
            all: z.array(zNeighborConstraint).optional(),
            some: z.array(zNeighborConstraint).optional(),
          })
          .describe("Filtered neighbor edges."),
      ])
      .optional(),
    maxNeighbors: z.number().int().nonnegative().optional().describe("Cap neighbors per root hit."),
    arms: z
      .object({
        lexical: z.number().optional().describe("RRF weight: BM25."),
        vector: z.number().optional().describe("RRF weight: vector."),
      })
      .optional()
      .describe("Lexical vs vector fusion weights; default 1:1. Set one to 0 to disable that arm."),
  })
  .strict();

export const zMemorySearchToolInput = z
  .object({
    content: zSearchContent.describe("Query text; host embeds and hybrid-searches."),
    options: zMemorySearchOptions.optional().describe("Optional filters and RRF tuning."),
  })
  .strict();

export type MemorySearchToolInput = z.infer<typeof zMemorySearchToolInput>;

function neighborOptionForSearch(
  neighbors: z.infer<typeof zMemorySearchOptions>["neighbors"],
): NeighborSearchOption | undefined {
  if (neighbors === undefined) return undefined;
  if (neighbors === "all") return true;
  if (neighbors === "off") return false;
  return neighbors;
}

const memorySearchTool = tool<
  "memory_search",
  MemorySearchToolInput,
  MemorySearchHit[],
  MemorySearchEnv
>({
  name: "memory_search",
  description:
    "Hybrid search (FTS + embedding) fused with RRF. Namespace and embed model are session-scoped. Tune options.arms for keyword vs semantic emphasis.",
  inputSchema: zMemorySearchToolInput,
  hooks: {
    onToolExecuted: async (e) => {
      if (e.toolName !== "memory_search") return;
      const input = e.input as MemorySearchToolInput | undefined;
      const text = input?.content?.text ?? "";
      const fullBodies = memoriesLogToolBodies();
      const inputForLog =
        fullBodies || !input
          ? input
          : {
              content: { text: text ? truncateForLog(text, 200) : "" },
              ...(input.options !== undefined ? { options: input.options } : {}),
            };
      logger.info(
        memoriesLog("memories.toolkit.toolCall", {
          processTimeMs: e.durationMs ?? 0,
          toolName: e.toolName,
          ok: e.ok,
          input: inputForLog,
          outputSummary:
            e.ok && Array.isArray(e.output)
              ? {
                  hitCount: e.output.length,
                  memoryKeys: (e.output as MemorySearchHit[]).slice(0, 20).map((h) => h.memory_key),
                }
              : undefined,
          error: e.ok ? undefined : e.error,
        }),
      );
    },
  },
  handler: async (ctx, input) => {
    const tHandler = performance.now();
    const env = ctx.env;
    const parsed = zMemorySearchToolInput.parse(input);
    const opts = parsed.options;
    const lexicalWeight = opts?.arms?.lexical ?? 1;
    const vectorWeight = opts?.arms?.vector ?? 1;
    if (lexicalWeight <= 0 && vectorWeight <= 0) {
      throw new Error("memory_search: at least one of options.arms.lexical or .vector must be > 0");
    }

    let embedMs = 0;
    let searchMs = 0;
    let embedCacheHit = false;

    let content: SearchContent;
    if (vectorWeight > 0) {
      const cacheKey = embeddingCacheKey(env.namespace, parsed.content.text);
      const cache = env.embeddingCache;
      let vector: number[] | undefined = cache?.get(cacheKey);

      if (vector) {
        embedCacheHit = true;
      } else {
        const tEmb = performance.now();
        const embeddings = await embedTextChunks(env.embeddingModel, [parsed.content.text]);
        embedMs = elapsedMs(tEmb);
        vector = embeddings[0];
        if (!vector) {
          throw new Error("memory_search: embedding pipeline returned no vector for query text");
        }
        cache?.set(cacheKey, vector);
      }

      content = lexicalWeight > 0 ? { text: parsed.content.text, vector } : { vector };
    } else {
      content = { text: parsed.content.text };
    }

    const tSearch = performance.now();
    const rawHits = await Promise.resolve(
      env.client.search({
        namespace: env.namespace,
        content,
        options: opts
          ? {
              ...opts,
              neighbors: neighborOptionForSearch(opts.neighbors),
            }
          : undefined,
      }),
    );
    searchMs = elapsedMs(tSearch);

    const slim = mapSearchHits(rawHits);

    logger.info(
      memoriesLog("memories.toolkit.memory_search", {
        processTimeMs: elapsedMs(tHandler),
        embedMs,
        searchMs,
        embedCacheHit,
        hitCount: slim.length,
      }),
    );

    return slim;
  },
});

/**
 * Agent-identity composable: hybrid DB search before merge.
 * Evaluate with {@link evaluateComposable} from `@cfd/agent-identity` and {@link MemorySearchEnv}.
 */
export const memorySearchToolkit = toolkit([memorySearchTool], {
  name: "memory-search-toolkit",
});
