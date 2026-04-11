import {
  createEmbeddingModel,
  type EmbeddingResolutionPreset,
  embedConfigForResolutionPreset,
  embedTextChunks,
} from "@cfd/librarian";
import {
  buildNamespaceGraphLayout,
  loadEdgePreview,
  loadMemoryTextPreview,
  type SearchHit,
  search,
} from "@cfd/memories";
import {
  createMemoriesPersistence,
  createMemoriesVisualization,
  openMemoriesDatabaseReadonly,
} from "@cfd/memories-persistence/sqlite";
import { serve } from "bun";
import index from "./index.html";

const MEMORIES_DB_PATH = process.env.MEMORIES_DB_PATH?.trim();

let didWarnLexicalOnlySearch = false;
let didWarnMultiVectorDim = false;
let didLogInferredSearchPreset = false;

const VEC_TABLE_DIM_RE = /^vector_features_vec_d_(\d+)$/;

function listVectorVecDimensions(db: ReturnType<typeof openMemoriesDatabaseReadonly>): number[] {
  const rows = db
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'vector_features_vec_d_%'`,
    )
    .all();
  const dims = new Set<number>();
  for (const { name } of rows) {
    const m = VEC_TABLE_DIM_RE.exec(name);
    if (m?.[1]) dims.add(Number(m[1]));
  }
  return [...dims].sort((a, b) => a - b);
}

function dimToEmbeddingPreset(dim: number): EmbeddingResolutionPreset | null {
  if (dim === 768) return "L";
  if (dim === 1536) return "M";
  if (dim === 3072) return "H";
  return null;
}

function parseExplicitEmbeddingPreset(v: string | undefined): EmbeddingResolutionPreset | null {
  if (v === undefined || v === null) return null;
  const u = String(v).trim().toUpperCase();
  if (u === "L" || u === "M" || u === "H") return u;
  return null;
}

/**
 * Body `resolution` / `MEMORIES_SEARCH_EMBEDDING_PRESET` win; otherwise if the DB has exactly one
 * vec0 table with a known Gemini dimension (768/1536/3072), use matching L/M/H so the query vector
 * matches indexed rows (otherwise the vector arm is empty).
 */
function resolveSearchEmbeddingPreset(
  db: ReturnType<typeof openMemoriesDatabaseReadonly>,
  bodyResolution: string | undefined,
): EmbeddingResolutionPreset {
  const fromBody = parseExplicitEmbeddingPreset(bodyResolution);
  if (fromBody) return fromBody;

  const fromEnv = parseExplicitEmbeddingPreset(
    process.env.MEMORIES_SEARCH_EMBEDDING_PRESET?.trim(),
  );
  if (fromEnv) return fromEnv;

  const dims = listVectorVecDimensions(db);
  if (dims.length === 1) {
    const dim = dims[0];
    const preset = dim !== undefined ? dimToEmbeddingPreset(dim) : null;
    if (preset) {
      if (!didLogInferredSearchPreset) {
        didLogInferredSearchPreset = true;
        console.info(
          `[memories] Search embeddings: preset ${preset} (${dim}d) inferred from the only vector index in the DB.`,
        );
      }
      return preset;
    }
  }
  if (dims.length > 1 && !didWarnMultiVectorDim) {
    didWarnMultiVectorDim = true;
    console.warn(
      `[memories] Multiple vector index dimensions in DB (${dims.join(", ")}d). Using preset M (1536d) unless you pass resolution in the search JSON body or set MEMORIES_SEARCH_EMBEDDING_PRESET=L|M|H.`,
    );
  }
  return "M";
}

/** Same env names as CLI / librarian for Gemini embeddings. */
function resolveGeminiApiKey(): string | undefined {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    undefined
  );
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const server = serve({
  routes: {
    "/api/search": async (req) => {
      if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      let body: {
        namespace?: string;
        query?: string;
        topK?: number;
        maxNeighbors?: number;
        /**
         * Embedding preset L|M|H (768 / 1536 / 3072). If omitted, the server infers L/M/H from the DB
         * when there is a single vector index dimension; otherwise defaults to M.
         */
        resolution?: string;
      };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return jsonResponse({ error: "invalid JSON body" }, 400);
      }
      const namespace = body.namespace?.trim();
      const query = (body.query ?? "").trim();
      if (!namespace) {
        return jsonResponse({ error: "missing namespace" }, 400);
      }
      if (!MEMORIES_DB_PATH) {
        return jsonResponse(
          { error: "set MEMORIES_DB_PATH to your SQLite memories database file" },
          400,
        );
      }
      if (!query) {
        return jsonResponse({ hitCount: 0, hitKeys: [], neighborKeys: [], keys: [] });
      }
      const topK = Math.min(50, Math.max(1, Number(body.topK) || 10));
      const maxNeighbors = Math.min(50, Math.max(0, Number(body.maxNeighbors) ?? 5));
      let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
      try {
        db = openMemoriesDatabaseReadonly(MEMORIES_DB_PATH);
      } catch (err) {
        return jsonResponse({ error: `open database: ${String(err)}` }, 500);
      }
      try {
        const apiKey = resolveGeminiApiKey();
        let content: { text: string; vector?: number[] };
        let arms: { lexical: number; vector: number };

        if (apiKey) {
          const resolution = resolveSearchEmbeddingPreset(db, body.resolution);
          const embeddingModel = createEmbeddingModel({
            apiKey,
            embedConfig: embedConfigForResolutionPreset(resolution),
          });
          try {
            const embeddings = await embedTextChunks(embeddingModel, [query]);
            const vector = embeddings[0];
            if (vector && vector.length > 0) {
              content = { text: query, vector };
              arms = { lexical: 1, vector: 1 };
            } else {
              content = { text: query };
              arms = { lexical: 1, vector: 0 };
              console.warn(
                "[memories] embedContent returned no usable vector for the query; search is lexical-only.",
              );
            }
          } catch (err) {
            content = { text: query };
            arms = { lexical: 1, vector: 0 };
            console.warn(
              `[memories] Query embedding failed; falling back to lexical-only: ${String(err)}`,
            );
          }
        } else {
          content = { text: query };
          arms = { lexical: 1, vector: 0 };
          if (!didWarnLexicalOnlySearch) {
            didWarnLexicalOnlySearch = true;
            console.warn(
              "[memories] No Gemini API key (GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_API_KEY / GEMINI_API_KEY); search is lexical-only. Set a key for hybrid vector search.",
            );
          }
        }

        const persistence = createMemoriesPersistence(db);
        const hits = search(
          { persistence },
          {
            namespace,
            content,
            options: {
              topK,
              neighbors: true,
              maxNeighbors,
              arms,
            },
          },
        );
        const hitKeys = hits.map((h: SearchHit) => h.memory.key);
        const neighborKeys: string[] = [];
        for (const h of hits) {
          for (const n of h.neighbors ?? []) {
            neighborKeys.push(n.key);
          }
        }
        const keys = [...new Set([...hitKeys, ...neighborKeys])];
        return jsonResponse({
          hitCount: hits.length,
          hitKeys,
          neighborKeys: [...new Set(neighborKeys)],
          keys,
        });
      } catch (err) {
        return jsonResponse({ error: String(err) }, 500);
      } finally {
        db.close();
      }
    },
    "/api/memory-preview": (req) => {
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const url = new URL(req.url);
      const namespace = url.searchParams.get("namespace")?.trim();
      const key = url.searchParams.get("key");
      if (!namespace || !key) {
        return jsonResponse({ error: "missing required query namespace and key" }, 400);
      }
      if (!MEMORIES_DB_PATH) {
        return jsonResponse(
          { error: "set MEMORIES_DB_PATH to your SQLite memories database file" },
          400,
        );
      }
      let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
      try {
        db = openMemoriesDatabaseReadonly(MEMORIES_DB_PATH);
      } catch (err) {
        return jsonResponse({ error: `open database: ${String(err)}` }, 500);
      }
      try {
        const visualization = createMemoriesVisualization(db);
        const preview = loadMemoryTextPreview({ persistence: visualization }, namespace, key);
        return jsonResponse({ key, preview });
      } catch (err) {
        return jsonResponse({ error: String(err) }, 500);
      } finally {
        db.close();
      }
    },
    "/api/edge-preview": (req) => {
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const url = new URL(req.url);
      const namespace = url.searchParams.get("namespace")?.trim();
      const edgeId = url.searchParams.get("edgeId")?.trim();
      if (!namespace || !edgeId) {
        return jsonResponse({ error: "missing required query namespace and edgeId" }, 400);
      }
      if (!MEMORIES_DB_PATH) {
        return jsonResponse(
          { error: "set MEMORIES_DB_PATH to your SQLite memories database file" },
          400,
        );
      }
      let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
      try {
        db = openMemoriesDatabaseReadonly(MEMORIES_DB_PATH);
      } catch (err) {
        return jsonResponse({ error: `open database: ${String(err)}` }, 500);
      }
      try {
        const visualization = createMemoriesVisualization(db);
        const detail = loadEdgePreview({ persistence: visualization }, namespace, edgeId);
        if (!detail) {
          return jsonResponse({ error: "edge not found in namespace" }, 404);
        }
        return jsonResponse(detail);
      } catch (err) {
        return jsonResponse({ error: String(err) }, 500);
      } finally {
        db.close();
      }
    },
    "/api/graph": (req) => {
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const url = new URL(req.url);
      const namespace = url.searchParams.get("namespace")?.trim();
      if (!namespace) {
        return jsonResponse({ error: "missing required query namespace" }, 400);
      }
      if (!MEMORIES_DB_PATH) {
        return jsonResponse(
          { error: "set MEMORIES_DB_PATH to your SQLite memories database file" },
          400,
        );
      }
      let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
      try {
        db = openMemoriesDatabaseReadonly(MEMORIES_DB_PATH);
      } catch (err) {
        return jsonResponse({ error: `open database: ${String(err)}` }, 500);
      }
      try {
        const visualization = createMemoriesVisualization(db);
        const layout = buildNamespaceGraphLayout({ persistence: visualization }, namespace);
        return jsonResponse(layout);
      } catch (err) {
        return jsonResponse({ error: String(err) }, 500);
      } finally {
        db.close();
      }
    },
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
