import type { EmbeddingResolutionPreset } from "@cfd/memories-core/helpers";

/** Fallback when `CFD_MEMORIES_NAMESPACE` is unset or empty. */
export const DEFAULT_MEMORIES_NAMESPACE = "_global_";

/**
 * Default memories namespace for CLI commands when `-ns` is not passed.
 * Set `CFD_MEMORIES_NAMESPACE` in `.env` (or the environment) to override.
 */
export function resolveDefaultMemoriesNamespace(): string {
  const fromEnv = process.env.CFD_MEMORIES_NAMESPACE?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_MEMORIES_NAMESPACE;
}

export type ParsedSearch = {
  sub: "search";
  db: string;
  store: string;
  namespace: string;
  resolution: EmbeddingResolutionPreset;
  query: string;
};

export type ParsedRemember = {
  sub: "remember";
  db: string;
  store: string;
  namespace: string;
  resolution: EmbeddingResolutionPreset;
  text: string;
};

export type ParsedSearchOrRemember = ParsedSearch | ParsedRemember;

export type ParsedTodoAdd = {
  sub: "todo";
  todoSub: "add";
  db: string;
  store: string;
  namespace: string;
  resolution: EmbeddingResolutionPreset;
  title: string;
  body?: string;
};

export type Parsed = ParsedSearchOrRemember | ParsedTodoAdd;

type ParseBaseDefaults = {
  /** Default when `-ns` is omitted (normally from {@link resolveDefaultMemoriesNamespace}). */
  namespace?: string;
};

function parseBaseFlags(
  rest: string[],
  defaults?: ParseBaseDefaults,
): {
  rest: string[];
  db: string;
  store: string;
  namespace: string;
  resolution: EmbeddingResolutionPreset;
} {
  let db = process.env.CFD_MEMORIES_DB ?? "./.cfd/memories.sqlite";
  let store = process.env.CFD_MEMORIES_STORE ?? "./.cfd/store.jsonl";
  let namespace = defaults?.namespace ?? resolveDefaultMemoriesNamespace();
  let resolution: EmbeddingResolutionPreset = "M";

  const isBaseFlag = (t: string | undefined) =>
    t === "--db" || t === "-s" || t === "-ns" || t === "-dim";

  while (isBaseFlag(rest[0])) {
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

  return { rest, db, store, namespace, resolution };
}

export function parseArgs(argv: string[]): Parsed {
  const rest0 = argv.slice(2);
  const sub = rest0.shift();
  if (!sub) {
    throw new Error(usageText());
  }

  if (sub === "todo") {
    const todoSub = rest0.shift();
    if (todoSub !== "add") {
      throw new Error("todo: only `todo add` is supported");
    }
    const base = parseBaseFlags(rest0);
    const rest = base.rest;
    let title = "";
    let body: string | undefined;

    const isTodoFlag = (t: string | undefined) => t === "--title" || t === "--body";
    while (isTodoFlag(rest[0])) {
      const flag = rest.shift();
      if (flag === "--title") {
        title = rest.shift() ?? "";
      } else if (flag === "--body") {
        body = rest.shift();
      }
      if (flag === "--title" && !title) throw new Error("Missing value after --title");
      if (flag === "--body" && body === undefined) throw new Error("Missing value after --body");
    }

    const titleFinal = title.trim() || rest.join(" ").trim();
    if (!titleFinal) {
      throw new Error('todo add: pass --title "..." or trailing title text');
    }
    return {
      sub: "todo",
      todoSub: "add",
      db: base.db,
      store: base.store,
      namespace: base.namespace,
      resolution: base.resolution,
      title: titleFinal,
      body: body?.trim() || undefined,
    };
  }

  if (sub !== "search" && sub !== "remember") {
    throw new Error(usageText());
  }

  const { rest, db, store, namespace, resolution } = parseBaseFlags(rest0);

  if (sub === "search") {
    const query = rest.join(" ").trim();
    if (!query) throw new Error("search: pass a non-empty query");
    return { sub: "search", db, store, namespace, resolution, query };
  }
  const text = rest.join(" ").trim();
  if (!text) throw new Error("remember: pass text to store");
  return { sub: "remember", db, store, namespace, resolution, text };
}

function usageText(): string {
  return `Usage: bun run src/index.ts search|remember|todo add [options] ...

todo add:
  --title <text>   Task title (required unless given as trailing text)
  --body <text>    Optional details

Options:
  --db <path>   SQLite DB (default: $CFD_MEMORIES_DB or ./.cfd/memories.sqlite)
  -s <path>     JSONL store for resolve-sourcemap (default: $CFD_MEMORIES_STORE or ./.cfd/store.jsonl)
  -ns <ns>      Memories namespace (overrides CFD_MEMORIES_NAMESPACE / default _global_)
  -dim L|M|H    Embedding output dimensionality (768 / 1536 / 3072); default M

Env:
  CFD_MEMORIES_NAMESPACE
    Default memories namespace for search, remember, and todo add when -ns is omitted (${DEFAULT_MEMORIES_NAMESPACE} if unset).
  GOOGLE_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY | GEMINI_API_KEY
    Same key is used for embeddings and chat (@ai-sdk/google).
  LOG_LEVEL=debug|info|warn|error
    Default info. Use debug for embedTextChunks / fuseRrf detail.
  LOG_PRETTY=0|1
    Default: pretty when stdout is a TTY; set 0 for JSON lines.
`;
}
