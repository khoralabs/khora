import { tool, toolkit } from "@cfd/agent-identity";
import z from "zod";
import { type EmbeddingModel, embedTextChunks } from "../adapters/embedding-model";
import type { MemoriesClient, SearchHit } from "@cfd/memories";

/** Runtime env for {@link memoryLibrarianToolkit}: client, namespace, and embedding model (injected; not tool args). */
export type MemoryLibrarianEnv<
  TNode extends Record<string, z.ZodType> = Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType> = Record<string, z.ZodType>,
> = {
  client: MemoriesClient<TNode, TEdge>;
  namespace: string;
  /** Used to embed `content.text` for the vector retrieval arm (same model as ingestion). */
  embeddingModel: EmbeddingModel;
};

/** Agent passes query text only; the handler embeds it and runs hybrid RRF (lexical + vector). */
const zSearchContent = z
  .object({
    text: z
      .string()
      .describe(
        "Query string: used for FTS and embedded for vector similarity; you cannot pass a raw embedding array.",
      ),
  })
  .strict();

const zNeighborConstraint = z.object({
  label: z
    .string()
    .describe(
      "Edge label kind/value (ontology) that incident edges must carry when expanding neighbors.",
    ),
  direction: z
    .enum(["in", "out"])
    .optional()
    .describe(
      'Optional: relative to each hit memory — "out" is from that memory toward the neighbor, "in" is the opposite.',
    ),
});

const zMemorySearchOptions = z
  .object({
    topK: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Maximum number of source-map hits to return after fusion (default applied by server if omitted).",
      ),
    minScore: z
      .number()
      .optional()
      .describe("Drop hits whose fused RRF score is below this threshold."),
    labels: z
      .object({
        all: z
          .array(z.string())
          .optional()
          .describe("Hit memory's node must have every listed node-label kind (AND)."),
        some: z
          .array(z.string())
          .optional()
          .describe("Hit memory's node must have at least one of these node-label kinds (OR)."),
      })
      .optional()
      .describe("Filter root hits by ontology node labels on the hit memory's node."),
    neighbors: z
      .object({
        all: z
          .array(zNeighborConstraint)
          .optional()
          .describe(
            "Per incident edge: include the neighbor only if this edge carries every listed constraint (label + optional direction) on the same edge (AND).",
          ),
        some: z
          .array(zNeighborConstraint)
          .optional()
          .describe(
            "Per incident edge: if non-empty, include the neighbor only if at least one constraint matches that edge (OR).",
          ),
      })
      .optional()
      .describe(
        "Does not filter root hits. When set, each hit's returned `neighbors` list only includes depth-1 adjacent memories along edges that pass these constraints.",
      ),
    arms: z
      .object({
        lexical: z
          .number()
          .optional()
          .describe(
            "RRF weight for the full-text (BM25) retrieval arm. Higher = keyword/BM25 ranking matters more in the fused results.",
          ),
        vector: z
          .number()
          .optional()
          .describe(
            "RRF weight for the embedding-similarity arm (query text embedded with the session embedding model). Higher = semantic match matters more.",
          ),
      })
      .optional()
      .describe(
        "Tune reciprocal rank fusion: relative influence of lexical vs vector hits. Defaults are equal (1/1). Set a weight to 0 to disable that arm entirely.",
      ),
  })
  .strict()
  .describe(
    "Optional tuning for hit count, score cutoff, label filters, neighbor edge filters, and RRF arm weights.",
  );

export const zMemorySearchToolInput = z
  .object({
    content: zSearchContent.describe(
      "Query text only. The tool embeds it and merges lexical + vector results; namespace and embedding model come from the session.",
    ),
    options: zMemorySearchOptions
      .optional()
      .describe("Fine-grained search behavior; omit for defaults."),
  })
  .strict();

export type MemorySearchToolInput = z.infer<typeof zMemorySearchToolInput>;

const memorySearchTool = tool<
  "memory_search",
  MemorySearchToolInput,
  SearchHit[],
  MemoryLibrarianEnv
>({
  name: "memory_search",
  description:
    "Search memories by query text: full-text plus embedding of the same string, fused with RRF. Use options.arms to emphasize keywords (lexical) vs semantics (vector). Namespace and embedding model are session-provided.",
  inputSchema: zMemorySearchToolInput,
  instructions: [
    "Pass content.text. The host embeds that string and runs hybrid search (FTS + vector); use options.arms.lexical vs .vector to weight the two retrieval arms in RRF (defaults: equal).",
  ],
  handler: async (ctx, input) => {
    const env = ctx.env;
    const parsed = zMemorySearchToolInput.parse(input);
    const embeddings = await embedTextChunks(env.embeddingModel, [parsed.content.text]);
    const vector = embeddings[0];
    if (!vector) {
      throw new Error("memory_search: embedding pipeline returned no vector for query text");
    }
    return env.client.search({
      namespace: env.namespace,
      content: { text: parsed.content.text, vector },
      options: parsed.options,
    });
  },
});

/**
 * Agent-identity composable: one tool to search the DB before merge.
 * Evaluate with {@link evaluateComposable} from `@cfd/agent-identity` and {@link MemoryLibrarianEnv}.
 */
export const memoryLibrarianToolkit = toolkit([memorySearchTool], {
  name: "memory-librarian-toolkit",
  instructions: [
    "Tools for discovering existing memories to link before a merge.",
    "memory_search: pass query text; the session embeds it and combines lexical + vector search (RRF). Adjust options.arms to favor keyword vs semantic matches.",
  ],
});
