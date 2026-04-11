import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  createEmbeddingModel,
  type EmbeddingResolutionPreset,
  embedConfigForResolutionPreset,
  embedTextChunks,
  listSourceMapsForMemory,
  processLogicalMemoryWithLibrarian,
} from "@cfd/librarian";
import {
  defineOntology,
  MemoriesClient,
  searchAsync,
  type ResolvedSource,
  wrapSyncMemoriesPersistenceAsAsync,
} from "@cfd/memories";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-persistence/sqlite";
import { getMemoryIdByNamespaceKey, JsonlStore } from "@cfd/stores";
import z from "zod";
import { elapsedMs, logger } from "./logger.js";

/** One Gemini key for @ai-sdk/google and @google/genai embeddings; .env often uses one name only. */
function resolveGeminiApiKey(): string {
  const k =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (!k) {
    throw new Error(
      "Set GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY) in .env — required for remember.",
    );
  }
  return k;
}

/** SQLite creates the DB file but not parent dirs; mkdir so default `./.cfd/...` works. */
function ensureParentDirForDb(filePath: string): void {
  if (filePath === ":memory:" || filePath.startsWith("file:")) return;
  const dir = dirname(filePath);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
}

const cliOntology = defineOntology({
  nodeLabels: {
    person: z.object({}),
    place: z.object({}),
    preference: z.object({}),
    event: z.object({}),
    fact: z.object({}),
    observation: z.object({}),
    belief: z.object({}),
    temporal: z.object({}),
  },
  edgeLabels: {
    references: z.object({}),
    affects: z.object({}),
    causes: z.object({}),
    describes: z.object({}),
    before: z.object({}),
    after: z.object({}),
    during: z.object({}),
    includes: z.object({}),
  },
});

type Parsed = {
  sub: "search" | "remember";
  db: string;
  store: string;
  namespace: string;
  resolution: EmbeddingResolutionPreset;
  query?: string;
  text?: string;
};

function parseArgs(argv: string[]): Parsed {
  const rest = argv.slice(2);
  const sub = rest.shift();
  if (sub !== "search" && sub !== "remember") {
    throw new Error(`Usage: bun run src/index.ts search|remember [options] <query|text...>

Options:
  --db <path>   SQLite DB (default: $CFD_MEMORIES_DB or ./.cfd/memories.sqlite)
  -st <path>     JSONL store for resolve-sourcemap (default: $CFD_MEMORIES_STORE or ./.cfd/store.jsonl)
  -ns <ns>       Memories namespace (default: cli)
  -dim L|M|H      Embedding output dimensionality (768 / 1536 / 3072); default M

Env:
  GOOGLE_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY | GEMINI_API_KEY
    Same key is used for embeddings (@google/genai) and chat (@ai-sdk/google).
  LOG_LEVEL=debug|info|warn|error
    Default info. Use debug for embedTextChunks / fuseRrf detail.
  LOG_PRETTY=0|1
    Default: pretty when stdout is a TTY; set 0 for JSON lines.
`);
  }
  let db = process.env.CFD_MEMORIES_DB ?? "./.cfd/memories.sqlite";
  let store = process.env.CFD_MEMORIES_STORE ?? "./.cfd/store.jsonl";
  let namespace = "cli";
  let resolution: EmbeddingResolutionPreset = "M";
  while (rest[0]?.startsWith("--")) {
    const flag = rest.shift();
    if (flag === "--db") {
      db = rest.shift() ?? "";
    } else if (flag === "-s") {
      store = rest.shift() ?? "";
    } else if (flag === "-ns") {
      namespace = rest.shift() ?? "";
    } else if (flag === "-dim") {
      const v = (rest.shift() ?? "").toUpperCase();
      if (v !== "L" && v !== "M" && v !== "H") {
        throw new Error("-dim must be L, M, or H");
      }
      resolution = v as EmbeddingResolutionPreset;
    } else {
      throw new Error(`Unknown flag: ${String(flag)}`);
    }
    if (flag === "--db" && !db) throw new Error("Missing value after --db");
    if (flag === "-s" && !store) throw new Error("Missing value after -s");
    if (flag === "-ns" && !namespace) throw new Error("Missing value after -ns");
  }
  if (sub === "search") {
    const query = rest.join(" ").trim();
    if (!query) throw new Error("search: pass a non-empty query");
    return { sub, db, store, namespace, resolution, query };
  }
  const text = rest.join(" ").trim();
  if (!text) throw new Error("remember: pass text to store");
  return { sub, db, store, namespace, resolution, text };
}

/** Max source maps to resolve per memory (newest `_ts_created` first). */
const SEARCH_RESOLVE_SOURCE_MAPS_LIMIT = 5;

/** Max graph neighbors per search hit (memories search API). */
const SEARCH_MAX_NEIGHBORS = 5;

async function resolveSourcesForMemory(
  db: Database,
  store: JsonlStore,
  memoryId: string,
  limit: number,
): Promise<Array<{ sourceKey: string; content: ResolvedSource | null }>> {
  const maps = listSourceMapsForMemory(db, memoryId, limit);
  const out: Array<{ sourceKey: string; content: ResolvedSource | null }> = [];
  for (const sm of maps) {
    let content: ResolvedSource | null = null;
    try {
      content = await store.resolve(sm);
    } catch {
      content = null;
    }
    out.push({ sourceKey: sm.source_key, content });
  }
  return out;
}

async function cmdSearch(args: Parsed) {
  const tPipeline = performance.now();
  ensureParentDirForDb(args.db);
  const db = openMemoriesDatabase(args.db);
  const persistence = createMemoriesPersistence(db);
  const store = new JsonlStore(args.store);
  const embeddingModel = createEmbeddingModel({
    apiKey: resolveGeminiApiKey(),
    embedConfig: embedConfigForResolutionPreset(args.resolution),
  });
  const tEmbed = performance.now();
  const embeddings = await embedTextChunks(embeddingModel, [args.query ?? ""]);
  logger.info({
    phase: "cli.search.embedQuery",
    durationMs: elapsedMs(tEmbed),
    resolution: args.resolution,
  });

  const tSearch = performance.now();
  const hits = await searchAsync(
    { persistence: wrapSyncMemoriesPersistenceAsAsync(persistence) },
    {
      namespace: args.namespace,
      content: { text: args.query ?? "", vector: embeddings[0] },
      options: {
        topK: 10,
        arms: { lexical: 1, vector: 1 },
        neighbors: true,
        maxNeighbors: SEARCH_MAX_NEIGHBORS,
      },
    },
  );
  logger.info({
    phase: "cli.search.searchAsync",
    durationMs: elapsedMs(tSearch),
    hitCount: hits.length,
  });

  const tEnrich = performance.now();
  for (const h of hits) {
    let content: ResolvedSource | null = null;
    try {
      content = await store.resolve(h);
    } catch {
      content = null;
    }

    const neighbors =
      h.neighbors &&
      (await Promise.all(
        h.neighbors.map(async (n) => ({
          memoryKey: n.key,
          labels: n.labels,
          sources: await resolveSourcesForMemory(
            db,
            store,
            n._id,
            SEARCH_RESOLVE_SOURCE_MAPS_LIMIT,
          ),
        })),
      ));

    console.log(
      JSON.stringify({
        score: h.score,
        memoryKey: h.memory.key,
        sourceKey: h.source_key,
        labels: h.labels,
        content,
        neighbors,
      }),
    );
  }
  logger.info({
    phase: "cli.search.enrichHits",
    durationMs: elapsedMs(tEnrich),
    hitCount: hits.length,
  });
  logger.info({
    phase: "cli.search",
    durationMs: elapsedMs(tPipeline),
    namespace: args.namespace,
  });
}

async function cmdRemember(args: Parsed) {
  ensureParentDirForDb(args.db);
  const db = openMemoriesDatabase(args.db);
  const client = new MemoriesClient(createMemoriesPersistence(db), cliOntology);
  const store = new JsonlStore(args.store);
  const key = `remember-${Date.now()}`;
  const apiKey = resolveGeminiApiKey();
  const embeddingModel = createEmbeddingModel({
    apiKey,
    embedConfig: embedConfigForResolutionPreset(args.resolution),
  });
  const google = createGoogleGenerativeAI({ apiKey });
  const model = google("gemini-flash-lite-latest");
  const tRemember = performance.now();
  const result = await processLogicalMemoryWithLibrarian({
    model,
    client,
    embeddingModel,
    logicalMemory: {
      key,
      namespace: args.namespace,
      plaintext: args.text,
      /** Same client as tools; otherwise decompose creates a new model that only reads `GOOGLE_API_KEY`. */
      embedding: { embeddingModel },
    },
    store,
    prefetch: true,
    runMerge: true,
    /** Tool calls + structured merge plan need more than one round; 2 steps often exits before `output`. */
    maxSteps: 6,
  });
  logger.info({
    phase: "cli.remember",
    durationMs: elapsedMs(tRemember),
    namespace: args.namespace,
    key,
    resolution: args.resolution,
  });
  const memoryId = getMemoryIdByNamespaceKey(db, args.namespace, key);
  if (memoryId) {
    store.syncFromMemoryDatabase(db, memoryId);
  }
  console.log(
    JSON.stringify({
      key,
      namespace: args.namespace,
      plan: result.plan,
      generation: {
        finishReason: result.generation.finishReason,
        usage: result.generation.usage,
      },
    }),
  );
}

const args = parseArgs(process.argv);
if (args.sub === "search") {
  await cmdSearch(args);
} else {
  await cmdRemember(args);
}
