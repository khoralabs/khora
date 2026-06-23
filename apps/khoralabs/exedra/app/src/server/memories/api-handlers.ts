import type { Database } from "bun:sqlite";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  type SearchHit,
  searchAsync,
  wrapSyncMemoriesPersistenceAsAsync,
} from "@khoralabs/memories-core";
import type { EmbeddingResolutionPreset } from "@khoralabs/memories-core/helpers";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";
import { getMemoriesSqliteDatabase, listMemoryNamespaces } from "@khoralabs/memories-sqlite";
import {
  buildNamespaceGraphLayout,
  buildNamespaceSubtreeGraphLayout,
  loadEdgePreview,
  loadSourceMapTextPreview,
  qualifyMemoryKey,
} from "@khoralabs/sqlite-graph-projections";
import { embedMany } from "ai";
import { withSpan } from "../telemetry/spans.js";

const NAMESPACE_ROOT = "_global_";
const EMBEDDING_DIM_BY_PRESET = { L: 768, M: 1536, H: 3072 } as const;

type GraphScope = "exact" | "subtree";

export type MemoriesAccess = {
  persistence: MemoriesPersistence;
  db: Database;
};

let didWarnLexicalOnlySearch = false;
let didWarnMultiVectorDim = false;
let didLogInferredSearchPreset = false;

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function parseGraphScope(raw: string | null | undefined): GraphScope {
  return raw?.trim().toLowerCase() === "subtree" ? "subtree" : "exact";
}

function resolveGeminiApiKey(): string | undefined {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || undefined;
}

function dimToEmbeddingPreset(dim: number): EmbeddingResolutionPreset | null {
  if (dim === 768) return "L";
  if (dim === 1536) return "M";
  if (dim === 3072) return "H";
  return null;
}

function parseExplicitEmbeddingPreset(value: string | undefined): EmbeddingResolutionPreset | null {
  if (value === undefined) return null;
  const upper = value.trim().toUpperCase();
  if (upper === "L" || upper === "M" || upper === "H") return upper;
  return null;
}

function providerOptionsForSearchPreset(preset: EmbeddingResolutionPreset) {
  return { google: { outputDimensionality: EMBEDDING_DIM_BY_PRESET[preset] } };
}

function resolveSearchEmbeddingPreset(
  persistence: MemoriesPersistence,
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
      if (!didLogInferredSearchPreset) didLogInferredSearchPreset = true;
      return preset;
    }
  }
  if (dims.length > 1 && !didWarnMultiVectorDim) didWarnMultiVectorDim = true;
  return "M";
}

function qualifySearchKey(namespace: string, memoryKey: string, scope: GraphScope): string {
  return scope === "subtree" ? qualifyMemoryKey(namespace, memoryKey) : memoryKey;
}

export function openMemoriesAccess(persistence: MemoriesPersistence): MemoriesAccess {
  return {
    persistence,
    db: getMemoriesSqliteDatabase(persistence),
  };
}

export function memoriesUnavailableResponse(message?: string): Response {
  return jsonResponse({ error: message ?? "Memories database is not configured" }, 503);
}

export function handleMemoriesNamespaces(
  access: MemoriesAccess,
  allowedNamespaces?: readonly string[],
): Response {
  try {
    const allNamespaces = listMemoryNamespaces(access.db);
    const namespaces =
      allowedNamespaces === undefined
        ? allNamespaces
        : allNamespaces.filter((namespace) => allowedNamespaces.includes(namespace));
    return jsonResponse({ namespaces, profiles: [], namespaceRoot: NAMESPACE_ROOT });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
}

export function handleMemoriesGraph(req: Request, access: MemoriesAccess): Response {
  const url = new URL(req.url);
  const namespace = url.searchParams.get("namespace")?.trim();
  if (!namespace) {
    return jsonResponse({ error: "missing required query namespace" }, 400);
  }
  const scope = parseGraphScope(url.searchParams.get("scope"));
  try {
    const layout =
      scope === "subtree"
        ? buildNamespaceSubtreeGraphLayout(access.db, access.persistence, namespace)
        : buildNamespaceGraphLayout(access.db, access.persistence, namespace);
    return jsonResponse(layout);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
}

export function handleMemoriesEdgePreview(req: Request, access: MemoriesAccess): Response {
  const url = new URL(req.url);
  const namespace = url.searchParams.get("namespace")?.trim();
  const edgeId = url.searchParams.get("edgeId")?.trim();
  if (!namespace || !edgeId) {
    return jsonResponse({ error: "missing required query namespace and edgeId" }, 400);
  }
  try {
    const detail = loadEdgePreview(access.persistence, namespace, edgeId);
    if (!detail) return jsonResponse({ error: "edge not found in namespace" }, 404);
    return jsonResponse(detail);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
}

export async function handleMemoriesSearch(
  req: Request,
  access: MemoriesAccess,
): Promise<Response> {
  let body: {
    namespace?: string;
    query?: string;
    topK?: number;
    maxNeighbors?: number;
    maxVectorDistance?: number;
    resolution?: string;
    scope?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }

  const namespace = body.namespace?.trim();
  const query = (body.query ?? "").trim();
  const scope = parseGraphScope(body.scope);
  if (!namespace) return jsonResponse({ error: "missing namespace" }, 400);
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

  try {
    return await withSpan("memories.search", { "memories.namespace": namespace }, async () => {
      const apiKey = resolveGeminiApiKey();
      let content: { text: string; vector?: number[] };
      let arms: { lexical: number; vector: number };

      if (apiKey) {
        const resolution = resolveSearchEmbeddingPreset(access.persistence, body.resolution);
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
        if (!didWarnLexicalOnlySearch) didWarnLexicalOnlySearch = true;
      }

      const hits = await searchAsync(
        { persistence: wrapSyncMemoriesPersistenceAsAsync(access.persistence) },
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

      const hitKeys = hits.map((hit: SearchHit) =>
        qualifySearchKey(hit.memory.namespace, hit.memory.key, scope),
      );
      const neighborKeys: string[] = [];
      const edgeEndpointKeys: string[] = [];
      const SEARCH_HIT_SNIPPET_MAX = 2400;

      for (const hit of hits) {
        for (const neighbor of hit.neighbors ?? []) {
          neighborKeys.push(qualifySearchKey(neighbor.namespace, neighbor.key, scope));
        }
        if (hit.graph.kind === "edge") {
          edgeEndpointKeys.push(
            qualifySearchKey(hit.memory.namespace, hit.graph.edge.fromKey, scope),
            qualifySearchKey(hit.memory.namespace, hit.graph.edge.toKey, scope),
          );
        }
      }

      const keys = [...new Set([...hitKeys, ...neighborKeys, ...edgeEndpointKeys])];
      const hitSnippets = hits.map((hit: SearchHit) => {
        const sourceMapId = (hit as SearchHit & { _id: string })._id;
        return {
          key: qualifySearchKey(hit.memory.namespace, hit.memory.key, scope),
          sourceKey: hit.source_key,
          text: loadSourceMapTextPreview(access.db, sourceMapId, SEARCH_HIT_SNIPPET_MAX),
        };
      });

      const edgeHitSnippets = hits.flatMap((hit: SearchHit) => {
        if (hit.graph.kind !== "edge") return [];
        const sourceMapId = (hit as SearchHit & { _id: string })._id;
        return [
          {
            edgeId: hit.graph.edge.edgeId,
            fromKey: qualifySearchKey(hit.memory.namespace, hit.graph.edge.fromKey, scope),
            toKey: qualifySearchKey(hit.memory.namespace, hit.graph.edge.toKey, scope),
            text: loadSourceMapTextPreview(access.db, sourceMapId, SEARCH_HIT_SNIPPET_MAX),
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
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
}
