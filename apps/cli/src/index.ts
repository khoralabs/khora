import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  createEmbeddingModel,
  listSourceMapsForMemory,
  processLogicalMemoryWithLibrarian,
} from "@cfd/librarian";
import {
  defineOntology,
  MemoriesClient,
  openMemoriesDatabase,
  type ResolvedSource,
} from "@cfd/memories";
import { getMemoryIdByNamespaceKey, JsonlStore } from "@cfd/stores";
import z from "zod";

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
  },
  edgeLabels: {
    references: z.object({}),
    affects: z.object({}),
    causes: z.object({}),
    is_about: z.object({}),
  },
});

type Parsed = {
  sub: "search" | "remember";
  db: string;
  store: string;
  namespace: string;
  query?: string;
  text?: string;
};

function parseArgs(argv: string[]): Parsed {
  const rest = argv.slice(2);
  const sub = rest.shift();
  if (sub !== "search" && sub !== "remember") {
    throw new Error(`Usage: bun run src/index.ts search|remember [options] <query|text...>

Options:
  --db <path>        SQLite DB (default: $CFD_MEMORIES_DB or ./.cfd/memories.sqlite)
  --store <path>     JSONL store for resolve-sourcemap (default: $CFD_MEMORIES_STORE or ./.cfd/store.jsonl)
  --namespace <ns>   Memories namespace (default: cli)

Env:
  GOOGLE_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY | GEMINI_API_KEY
    Same key is used for embeddings (@google/genai) and chat (@ai-sdk/google).
`);
  }
  let db = process.env.CFD_MEMORIES_DB ?? "./.cfd/memories.sqlite";
  let store = process.env.CFD_MEMORIES_STORE ?? "./.cfd/store.jsonl";
  let namespace = "cli";
  while (rest[0]?.startsWith("--")) {
    const flag = rest.shift();
    if (flag === "--db") {
      db = rest.shift() ?? "";
    } else if (flag === "--store") {
      store = rest.shift() ?? "";
    } else if (flag === "--namespace") {
      namespace = rest.shift() ?? "";
    } else {
      throw new Error(`Unknown flag: ${String(flag)}`);
    }
    if (flag === "--db" && !db) throw new Error("Missing value after --db");
    if (flag === "--store" && !store) throw new Error("Missing value after --store");
    if (flag === "--namespace" && !namespace) throw new Error("Missing value after --namespace");
  }
  if (sub === "search") {
    const query = rest.join(" ").trim();
    if (!query) throw new Error("search: pass a non-empty query");
    return { sub, db, store, namespace, query };
  }
  const text = rest.join(" ").trim();
  if (!text) throw new Error("remember: pass text to store");
  return { sub, db, store, namespace, text };
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
  ensureParentDirForDb(args.db);
  const db = openMemoriesDatabase(args.db);
  const client = new MemoriesClient(db, cliOntology);
  const store = new JsonlStore(args.store);
  const embeddingModel = createEmbeddingModel({ apiKey: resolveGeminiApiKey() });
  const { embeddings } = await embeddingModel.client.models.embedContent({
    model: embeddingModel.model,
    contents: [args.query ?? ""],
  });
  const vector = (embeddings ?? [])[0]?.values ?? [];

  const hits = client.search({
    namespace: args.namespace,
    content: { text: args.query ?? "", vector },
    options: {
      topK: 10,
      arms: { lexical: 1, vector: 1 },
      neighbors: true,
      maxNeighbors: SEARCH_MAX_NEIGHBORS,
    },
  });
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
}

async function cmdRemember(args: Parsed) {
  ensureParentDirForDb(args.db);
  const db = openMemoriesDatabase(args.db);
  const client = new MemoriesClient(db, cliOntology);
  const store = new JsonlStore(args.store);
  const key = `remember-${Date.now()}`;
  const apiKey = resolveGeminiApiKey();
  const embeddingModel = createEmbeddingModel({ apiKey });
  const google = createGoogleGenerativeAI({ apiKey });
  const model = google("gemini-flash-latest");
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
    maxSteps: 2,
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
