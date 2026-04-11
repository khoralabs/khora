import type { EmbeddingResolutionPreset } from "@cfd/librarian";

export type Parsed = {
  sub: "search" | "remember";
  db: string;
  store: string;
  namespace: string;
  resolution: EmbeddingResolutionPreset;
  query?: string;
  text?: string;
};

export function parseArgs(argv: string[]): Parsed {
  const rest = argv.slice(2);
  const sub = rest.shift();
  if (sub !== "search" && sub !== "remember") {
    throw new Error(`Usage: bun run src/index.ts search|remember [options] <query|text...>

Options:
  --db <path>   SQLite DB (default: $CFD_MEMORIES_DB or ./.cfd/memories.sqlite)
  -s <path>     JSONL store for resolve-sourcemap (default: $CFD_MEMORIES_STORE or ./.cfd/store.jsonl)
  -ns <ns>      Memories namespace (default: cli)
  -dim L|M|H    Embedding output dimensionality (768 / 1536 / 3072); default M

Env:
  GOOGLE_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY | GEMINI_API_KEY
    Same key is used for embeddings and chat (@ai-sdk/google).
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

  const isKnownFlag = (t: string | undefined) =>
    t === "--db" || t === "-s" || t === "-ns" || t === "-dim";

  while (isKnownFlag(rest[0])) {
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
