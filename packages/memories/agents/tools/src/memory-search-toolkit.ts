import { policy, tool, toolkit } from "@cfd/agent-identity";
import type {
  MemoriesClient,
  MemoriesClientAsync,
  NeighborSearchOption,
  OntologyLabelInstance,
  SearchContent,
  SearchHit,
} from "@cfd/memories-core";
import z from "zod";
import { embedTextChunks } from "./embedding-text.js";
import type { EmbeddingModel } from "./embedding-types.js";

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
  /** `node` vs `edge` memory (edge hits carry optional graph edge summary). */
  kind: "node" | "edge";
  score: number;
  labels: OntologyLabelInstance[];
  source_key: string;
  /** Present when `kind` is `edge` (endpoint keys + edge label kinds). */
  edge?: { from_key: string; to_key: string; edge_label_kinds: string[] };
  neighbors?: Array<{ memory_key: string; labels: OntologyLabelInstance[] }>;
};

const MAX_NEIGHBORS_PER_HIT = 8;

function mapSearchHit(hit: SearchHit): MemorySearchHit {
  const row: MemorySearchHit = {
    memory_key: hit.memory.key,
    kind: hit.graph.kind === "edge" ? "edge" : "node",
    score: hit.score,
    labels: [...hit.labels],
    source_key: hit.source_key,
  };
  if (hit.graph.kind === "edge") {
    row.edge = {
      from_key: hit.graph.edge.fromKey,
      to_key: hit.graph.edge.toKey,
      edge_label_kinds: hit.graph.edge.labels.map((l) => l.kind),
    };
  }
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

/** Runtime env for {@link memorySearchToolkit}: memory store, namespace, and embedding model (injected; not tool args). */
export type MemorySearchEnv = {
  /** Name avoids clashing with other composed toolkits that use {@code client} for a domain API. */
  memoriesClient: MemorySearchWideClient | MemorySearchWideClientAsync;
  namespace: string;
  /** Used to embed `content.text` for the vector retrieval arm (same model as ingestion). */
  embeddingModel: EmbeddingModel;
  /**
   * Optional per-session cache for query embedding vectors (same normalized key as {@link embeddingCacheKey}).
   * Instantiated in {@link buildMemorySearchToolkitContext}.
   */
  embeddingCache?: Map<string, number[]>;
  /**
   * When set (via {@link toMemorySearchEnv} / host), {@link memorySearchBudgetPolicy} gates each call and
   * {@link memorySearchTool} increments {@code used} after a completed search.
   */
  memorySearchBudget?: { max: number; used: number };
};

/** Policy id for {@link memorySearchBudgetPolicy} (hash-stable). */
export const MEMORY_SEARCH_BUDGET_POLICY_ID = "memory_search_budget";

/** Gates {@code memory_search} while {@code used < max}; no-op when {@link MemorySearchEnv.memorySearchBudget} is absent. */
export const memorySearchBudgetPolicy = policy<MemorySearchEnv>(
  MEMORY_SEARCH_BUDGET_POLICY_ID,
  async (env) => {
    const b = env.memorySearchBudget;
    if (b === undefined) return true;
    return b.used < b.max;
  },
);

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
    "Hybrid search (FTS + embedding) fused with RRF. Namespace and embed model are session-scoped. Tune options.arms for keyword vs semantic emphasis. When the host sets a search budget, further calls are denied until the env is reset for a new turn.",
  inputSchema: zMemorySearchToolInput,
  policies: [memorySearchBudgetPolicy],
  handler: async (ctx, input) => {
    const env = ctx.env;
    const parsed = zMemorySearchToolInput.parse(input);
    const opts = parsed.options;
    const lexicalWeight = opts?.arms?.lexical ?? 1;
    const vectorWeight = opts?.arms?.vector ?? 1;
    if (lexicalWeight <= 0 && vectorWeight <= 0) {
      throw new Error("memory_search: at least one of options.arms.lexical or .vector must be > 0");
    }

    let content: SearchContent;
    if (vectorWeight > 0) {
      const cacheKey = embeddingCacheKey(env.namespace, parsed.content.text);
      const cache = env.embeddingCache;
      let vector: number[] | undefined = cache?.get(cacheKey);

      if (!vector) {
        const embeddings = await embedTextChunks(env.embeddingModel, [parsed.content.text]);
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

    const rawHits = await Promise.resolve(
      env.memoriesClient.search({
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

    const slim = mapSearchHits(rawHits);

    const budget = env.memorySearchBudget;
    if (budget !== undefined) {
      budget.used += 1;
    }

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
