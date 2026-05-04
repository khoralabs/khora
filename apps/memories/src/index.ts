import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type AgentRegistry, createAgentRegistry } from "@cfd/agent-identity";
import {
  MemoriesClient,
  type SearchHit,
  searchAsync,
  wrapSyncMemoriesPersistenceAsAsync,
} from "@cfd/memories-core";
import {
  createMemoriesEmbeddingModel,
  mergeResolutionAndProviderOptions,
} from "@cfd/memories-core/helpers";
import { canonicalOntology } from "@cfd/memories-core/ontologies";
import { MemoryInvestigatorClient } from "@cfd/memories-investigator";
import {
  buildNamespaceGraphLayout,
  createMemoriesPersistence,
  listMemoryNamespaces,
  loadEdgePreview,
  loadMemoryTextPreview,
  loadSourceMapTextPreview,
  openMemoriesDatabaseReadonly,
} from "@cfd/memories-sqlite";
import { embedMany } from "ai";
import { serve } from "bun";
import index from "./index.html";

const MEMORIES_DB_PATH = process.env.MEMORIES_DB_PATH?.trim();

/** L/M/H output dimensionality for Google `gemini-embedding-2-preview` (aligned with CLI librarian presets). */
const EMBEDDING_DIM_BY_PRESET = { L: 768, M: 1536, H: 3072 } as const;
type EmbeddingResolutionPreset = keyof typeof EMBEDDING_DIM_BY_PRESET;

function providerOptionsForSearchPreset(preset: EmbeddingResolutionPreset) {
  return { google: { outputDimensionality: EMBEDDING_DIM_BY_PRESET[preset] } };
}

let didWarnLexicalOnlySearch = false;
let didWarnMultiVectorDim = false;
let didLogInferredSearchPreset = false;

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
  persistence: ReturnType<typeof createMemoriesPersistence>,
  bodyResolution: string | undefined,
): EmbeddingResolutionPreset {
  const fromBody = parseExplicitEmbeddingPreset(bodyResolution);
  if (fromBody) return fromBody;

  const fromEnv = parseExplicitEmbeddingPreset(
    process.env.MEMORIES_SEARCH_EMBEDDING_PRESET?.trim(),
  );
  if (fromEnv) return fromEnv;

  const dims = persistence.listVectorEmbeddingIndexDimensions();
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

/** Process-wide registry; investigator caches its agent identity by namespace + tool config. */
let investigatorRegistry: AgentRegistry | undefined;
function getInvestigatorRegistry(): AgentRegistry {
  if (!investigatorRegistry) investigatorRegistry = createAgentRegistry();
  return investigatorRegistry;
}

function parseListenPort(): number {
  const raw = process.env.PORT?.trim();
  if (!raw) return 3000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    console.warn(`[memories] Invalid PORT "${raw}", using 3000`);
    return 3000;
  }
  return n;
}

const listenPort = parseListenPort();

const server = serve({
  port: listenPort,
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
        /** sqlite‑vec KNN distance upper bound for the vector arm (omit = no cutoff). */
        maxVectorDistance?: number;
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
        return jsonResponse({
          hitCount: 0,
          hitKeys: [],
          neighborKeys: [],
          keys: [],
          hitSnippets: [],
          edgeHitSnippets: [],
        });
      }
      const topK = Math.min(50, Math.max(1, Number(body.topK) || 10));
      const maxNeighbors = Math.min(50, Math.max(0, Number(body.maxNeighbors) ?? 5));
      const rawMaxDist = body.maxVectorDistance;
      const maxVectorDistance =
        rawMaxDist !== undefined && Number.isFinite(rawMaxDist) && rawMaxDist > 0
          ? rawMaxDist
          : undefined;
      let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
      try {
        db = openMemoriesDatabaseReadonly(MEMORIES_DB_PATH);
      } catch (err) {
        return jsonResponse({ error: `open database: ${String(err)}` }, 500);
      }
      try {
        const persistence = createMemoriesPersistence(db);
        const apiKey = resolveGeminiApiKey();
        let content: { text: string; vector?: number[] };
        let arms: { lexical: number; vector: number };

        if (apiKey) {
          const resolution = resolveSearchEmbeddingPreset(persistence, body.resolution);
          const google = createGoogleGenerativeAI({ apiKey });
          try {
            const { embeddings } = await embedMany({
              model: google.embedding("gemini-embedding-2-preview"),
              values: [query],
              providerOptions: providerOptionsForSearchPreset(resolution),
            });
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

        const hits = await searchAsync(
          { persistence: wrapSyncMemoriesPersistenceAsAsync(persistence) },
          {
            namespace,
            content,
            options: {
              topK,
              neighbors: true,
              maxNeighbors,
              arms,
              ...(maxVectorDistance !== undefined ? { maxVectorDistance } : {}),
            },
          },
        );
        const hitKeys = hits.map((h: SearchHit) => h.memory.key);
        const neighborKeys: string[] = [];
        const edgeEndpointKeys: string[] = [];
        const SEARCH_HIT_SNIPPET_MAX = 2400;

        for (const h of hits) {
          for (const n of h.neighbors ?? []) {
            neighborKeys.push(n.key);
          }
          if (h.graph.kind === "edge") {
            edgeEndpointKeys.push(h.graph.edge.fromKey, h.graph.edge.toKey);
          }
        }

        const keys = [...new Set([...hitKeys, ...neighborKeys, ...edgeEndpointKeys])];

        const hitSnippets = hits.map((h: SearchHit) => {
          const sourceMapId = (h as SearchHit & { _id: string })._id;
          return {
            key: h.memory.key,
            sourceKey: h.source_key,
            text: loadSourceMapTextPreview(db, sourceMapId, SEARCH_HIT_SNIPPET_MAX),
          };
        });

        const edgeHitSnippets = hits.flatMap((h: SearchHit) => {
          if (h.graph.kind !== "edge") return [];
          const sourceMapId = (h as SearchHit & { _id: string })._id;
          return [
            {
              edgeId: h.graph.edge.edgeId,
              fromKey: h.graph.edge.fromKey,
              toKey: h.graph.edge.toKey,
              text: loadSourceMapTextPreview(db, sourceMapId, SEARCH_HIT_SNIPPET_MAX),
            },
          ];
        });

        return jsonResponse({
          hitCount: hits.length,
          hitKeys,
          neighborKeys: [...new Set(neighborKeys)],
          keys,
          hitSnippets,
          edgeHitSnippets,
        });
      } catch (err) {
        return jsonResponse({ error: String(err) }, 500);
      } finally {
        db.close();
      }
    },
    "/api/investigate": async (req) => {
      if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      let body: {
        namespace?: string;
        question?: string;
        maxSteps?: number;
        resolution?: string;
      };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return jsonResponse({ error: "invalid JSON body" }, 400);
      }
      const namespace = body.namespace?.trim();
      const question = body.question?.trim();
      if (!namespace) return jsonResponse({ error: "missing namespace" }, 400);
      if (!question) return jsonResponse({ error: "missing question" }, 400);
      if (!MEMORIES_DB_PATH) {
        return jsonResponse(
          { error: "set MEMORIES_DB_PATH to your SQLite memories database file" },
          400,
        );
      }
      const apiKey = resolveGeminiApiKey();
      if (!apiKey) {
        return jsonResponse(
          {
            error:
              "set GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_API_KEY / GEMINI_API_KEY for the memory investigator",
          },
          400,
        );
      }
      const rawSteps = Number(body.maxSteps);
      const maxSteps =
        Number.isFinite(rawSteps) && rawSteps > 0 ? Math.min(50, Math.floor(rawSteps)) : 12;

      let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
      try {
        db = openMemoriesDatabaseReadonly(MEMORIES_DB_PATH);
      } catch (err) {
        return jsonResponse({ error: `open database: ${String(err)}` }, 500);
      }
      try {
        const persistence = createMemoriesPersistence(db);
        const resolution = resolveSearchEmbeddingPreset(persistence, body.resolution);
        const google = createGoogleGenerativeAI({ apiKey });
        const embeddingModel = createMemoriesEmbeddingModel({
          model: google.embedding("gemini-embedding-2-preview"),
          providerOptions: mergeResolutionAndProviderOptions(resolution),
        });
        const modelId =
          process.env.MEMORIES_INVESTIGATOR_MODEL?.trim() || "gemini-flash-latest";
        const model = google.languageModel(modelId);
        const client = new MemoriesClient(persistence, canonicalOntology);
        const investigator = new MemoryInvestigatorClient({
          registry: getInvestigatorRegistry(),
          namespace,
          model,
          client,
          embeddingModel,
        });
        const { answer } = await investigator.investigate({ question, maxSteps });
        return jsonResponse(answer);
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
        const preview = loadMemoryTextPreview(db, namespace, key);
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
        const detail = loadEdgePreview(db, namespace, edgeId);
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
    "/api/namespaces": (req) => {
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
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
        const namespaces = listMemoryNamespaces(db);
        return jsonResponse({ namespaces });
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
        const persistence = createMemoriesPersistence(db);
        const layout = buildNamespaceGraphLayout(db, persistence, namespace);
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

let isShuttingDown = false;
function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`[memories] ${signal} received, stopping server…`);
  server
    .stop()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("[memories] server.stop() failed:", err);
      process.exit(1);
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
