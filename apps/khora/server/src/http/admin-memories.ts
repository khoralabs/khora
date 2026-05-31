import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type AgentRegistry, createAgentRegistry } from "@khoralabs/agent-identity";
import {
  MemoriesClient,
  type SearchHit,
  searchAsync,
  wrapSyncMemoriesPersistenceAsAsync,
} from "@khoralabs/memories-core";
import {
  createMemoriesEmbeddingModel,
  type EmbeddingResolutionPreset,
  mergeResolutionAndProviderOptions,
} from "@khoralabs/memories-core/helpers";
import { canonicalOntology } from "@khoralabs/memories-core/ontologies";
import { MemoryInvestigatorClient } from "@khoralabs/memories-investigator";
import {
  buildNamespaceGraphLayout,
  createMemoriesPersistence,
  listMemoryNamespaces,
  loadEdgePreview,
  loadSourceMapTextPreview,
  openMemoriesDatabaseReadonly,
} from "@khoralabs/memories-sqlite";
import { embedMany } from "ai";
import { envMemoriesDbPath } from "../env";
import { envMemoriesEnabled } from "../memories-env";
import { withConsoleAuth } from "./console-guard";
import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

const ADMIN_MEMORIES_PREFIX = "/admin/api/memories";

const EMBEDDING_DIM_BY_PRESET = { L: 768, M: 1536, H: 3072 } as const;

let didWarnLexicalOnlySearch = false;
let didWarnMultiVectorDim = false;
let didLogInferredSearchPreset = false;
let investigatorRegistry: AgentRegistry | undefined;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function memoriesUnavailableResponse(): Response {
  return jsonError("Memories database is not configured on this host", 503);
}

function resolveGeminiApiKey(): string | undefined {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    undefined
  );
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

function providerOptionsForSearchPreset(preset: EmbeddingResolutionPreset) {
  return { google: { outputDimensionality: EMBEDDING_DIM_BY_PRESET[preset] } };
}

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
      }
      return preset;
    }
  }
  if (dims.length > 1 && !didWarnMultiVectorDim) {
    didWarnMultiVectorDim = true;
  }
  return "M";
}

function getInvestigatorRegistry(): AgentRegistry {
  if (!investigatorRegistry) investigatorRegistry = createAgentRegistry();
  return investigatorRegistry;
}

function memoriesSubpath(url: URL): string {
  return url.pathname.slice(ADMIN_MEMORIES_PREFIX.length);
}

async function handleMemoriesRoute(req: Request, url: URL): Promise<Response> {
  if (!envMemoriesEnabled()) {
    return memoriesUnavailableResponse();
  }

  const subpath = memoriesSubpath(url);

  if (req.method === "GET" && subpath === "/namespaces") {
    let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
    try {
      db = openMemoriesDatabaseReadonly(envMemoriesDbPath());
    } catch (err) {
      return jsonResponse({ error: `open database: ${String(err)}` }, 500);
    }
    try {
      return jsonResponse({ namespaces: listMemoryNamespaces(db) });
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    } finally {
      db.close();
    }
  }

  if (req.method === "GET" && subpath === "/graph") {
    const namespace = url.searchParams.get("namespace")?.trim();
    if (!namespace) {
      return jsonResponse({ error: "missing required query namespace" }, 400);
    }
    let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
    try {
      db = openMemoriesDatabaseReadonly(envMemoriesDbPath());
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
  }

  if (req.method === "GET" && subpath === "/edge-preview") {
    const namespace = url.searchParams.get("namespace")?.trim();
    const edgeId = url.searchParams.get("edgeId")?.trim();
    if (!namespace || !edgeId) {
      return jsonResponse({ error: "missing required query namespace and edgeId" }, 400);
    }
    let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
    try {
      db = openMemoriesDatabaseReadonly(envMemoriesDbPath());
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
  }

  if (req.method === "POST" && subpath === "/search") {
    let body: {
      namespace?: string;
      query?: string;
      topK?: number;
      maxNeighbors?: number;
      maxVectorDistance?: number;
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
      db = openMemoriesDatabaseReadonly(envMemoriesDbPath());
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
          }
        } catch {
          content = { text: query };
          arms = { lexical: 1, vector: 0 };
        }
      } else {
        content = { text: query };
        arms = { lexical: 1, vector: 0 };
        if (!didWarnLexicalOnlySearch) {
          didWarnLexicalOnlySearch = true;
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
  }

  if (req.method === "POST" && subpath === "/investigate") {
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
      db = openMemoriesDatabaseReadonly(envMemoriesDbPath());
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
      const modelId = process.env.MEMORIES_INVESTIGATOR_MODEL?.trim() || "gemini-flash-latest";
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
  }

  return jsonError("Not found", 404);
}

export async function handleAdminMemoriesRoute(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  return withConsoleAuth(req, deps, () => handleMemoriesRoute(req, url));
}
