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
  openMemoriesDatabaseReadonly,
  type SearchHit,
  search,
} from "@cfd/memories";
import { serve } from "bun";
import index from "./index.html";

const MEMORIES_DB_PATH = process.env.MEMORIES_DB_PATH?.trim();

/** Same env names as CLI / librarian for Gemini embeddings. */
function resolveGeminiApiKey(): string | undefined {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    undefined
  );
}

function parseResolution(v: string | undefined): EmbeddingResolutionPreset {
  const u = (v ?? "M").toString().toUpperCase();
  if (u === "L" || u === "H") return u;
  return "M";
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
        /** Embedding preset L|M|H (768 / 1536 / 3072); default M. Ignored without a Gemini API key. */
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
          const resolution = parseResolution(body.resolution);
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
            }
          } catch {
            content = { text: query };
            arms = { lexical: 1, vector: 0 };
          }
        } else {
          content = { text: query };
          arms = { lexical: 1, vector: 0 };
        }

        const hits = search(
          { db },
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
        const preview = loadMemoryTextPreview({ db }, namespace, key);
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
        const detail = loadEdgePreview({ db }, namespace, edgeId);
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
        const layout = buildNamespaceGraphLayout({ db }, namespace);
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
