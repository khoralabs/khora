import type { Database } from "bun:sqlite";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type AgentRegistry, createAgentRegistry } from "@khoralabs/agent-capabilities";
import {
  EnvKeyProvider,
  openMaybeEncryptedDatabaseSync,
  tryGetSqlCipherKey,
} from "@khoralabs/colonnade-crypto";
import {
  purgeEmptyPendingEmbeddings,
  readPendingEmbeddingQueueSummary,
  resetFailedPendingEmbeddings,
  runPendingEmbeddingRetryBatch,
} from "@khoralabs/khora-host";
import { NAMESPACE_ENTITY_PROFILE, ProjectionStore } from "@khoralabs/khora-host-sqlite";
import { type HostRouteDeps, jsonError, withAdminTokenAuth } from "@khoralabs/khora-server-http";
import { MemoryInvestigatorClient } from "@khoralabs/memories-agents/investigator";
import type { MemoriesPersistenceAsync } from "@khoralabs/memories-node";
import { MemoriesClient, type SearchHit, searchAsync } from "@khoralabs/memories-node";
import {
  createMemoriesEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingResolutionPreset,
  mergeResolutionAndProviderOptions,
} from "@khoralabs/memories-node/helpers";
import { canonicalOntology } from "@khoralabs/memories-node/ontology";
import { qualifyMemoryKey } from "@khoralabs/memories-node/projections";
import {
  buildNamespaceGraphLayout,
  buildNamespaceSubtreeGraphLayout,
  getMemoriesSyncPersistenceFromAsync,
  listMemoryNamespaces,
  loadEdgePreview,
  loadSourceMapTextPreview,
} from "@khoralabs/memories-node/sqlite";
import { embedMany } from "ai";
import { envHostDbPath } from "../env";
import { envMemoriesEnabled } from "../memories-env";

const ADMIN_MEMORIES_PREFIX = "/admin/api/memories";

const EMBEDDING_DIM_BY_PRESET = { L: 768, M: 1536, H: 3072 } as const;

export type AdminMemoriesProfileEntry = {
  profileId: string;
  username?: string;
  namespace: string;
  indexed: boolean;
};

type GraphScope = "exact" | "subtree";

type MemoriesAccess = {
  persistence: MemoriesPersistenceAsync;
  syncPersistence: ReturnType<typeof getMemoriesSyncPersistenceFromAsync>;
  db: Database;
  namespaceRoot: string;
  embeddingModel?: EmbeddingModel;
};

let didWarnLexicalOnlySearch = false;
let didWarnMultiVectorDim = false;
let didLogInferredSearchPreset = false;
let investigatorRegistry: AgentRegistry | undefined;

function profileMemoryNamespace(namespaceRoot: string, profileId: string): string {
  return `${namespaceRoot}/agents/${profileId}/profile`;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function memoriesUnavailableResponse(): Response {
  return jsonError("Memories database is not configured on this host", 503);
}

function resolveMemoriesAccess(deps: HostRouteDeps): MemoriesAccess | Response {
  if (!envMemoriesEnabled()) {
    return memoriesUnavailableResponse();
  }
  const memories = deps.ctx.memories;
  if (memories === undefined || deps.memoriesSqliteDb === undefined) {
    return memoriesUnavailableResponse();
  }
  try {
    return {
      persistence: memories.persistence,
      syncPersistence: getMemoriesSyncPersistenceFromAsync(memories.persistence),
      db: deps.memoriesSqliteDb,
      namespaceRoot: memories.namespaceRoot,
      embeddingModel: memories.embeddingModel,
    };
  } catch {
    return memoriesUnavailableResponse();
  }
}

function parseGraphScope(raw: string | null | undefined): GraphScope {
  return raw?.trim().toLowerCase() === "subtree" ? "subtree" : "exact";
}

function parseProfileUsername(bodyJson: string): string | undefined {
  try {
    const parsed = JSON.parse(bodyJson) as { username?: unknown };
    return typeof parsed.username === "string" ? parsed.username : undefined;
  } catch {
    return undefined;
  }
}

async function listHostProfiles(
  tenantKey: string,
): Promise<Array<{ profileId: string; username?: string }>> {
  const sqlCipherKey = await tryGetSqlCipherKey(new EnvKeyProvider(), "khora");
  const hostDb = openMaybeEncryptedDatabaseSync(envHostDbPath(), { readonly: true }, sqlCipherKey);
  try {
    const store = new ProjectionStore(hostDb);
    const rows = store.listByPrefix(tenantKey, NAMESPACE_ENTITY_PROFILE, "");
    const out: Array<{ profileId: string; username?: string }> = [];
    for (const row of rows) {
      const projection = row.projection;
      if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
        continue;
      }
      const o = projection as Record<string, unknown>;
      if (o.deleted === true) continue;
      const profileId = typeof o.id === "string" ? o.id : row.entry_key;
      const bodyJson = typeof o.bodyJson === "string" ? o.bodyJson : "";
      out.push({
        profileId,
        username: parseProfileUsername(bodyJson),
      });
    }
    return out;
  } finally {
    hostDb.close();
  }
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
  persistence: MemoriesPersistenceAsync,
  bodyResolution: string | undefined,
): EmbeddingResolutionPreset {
  const fromBody = parseExplicitEmbeddingPreset(bodyResolution);
  if (fromBody) return fromBody;

  const fromEnv = parseExplicitEmbeddingPreset(
    process.env.MEMORIES_SEARCH_EMBEDDING_PRESET?.trim(),
  );
  if (fromEnv) return fromEnv;

  const dims =
    getMemoriesSyncPersistenceFromAsync(persistence).listVectorEmbeddingIndexDimensions();
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

function qualifySearchKey(namespace: string, memoryKey: string, scope: GraphScope): string {
  return scope === "subtree" ? qualifyMemoryKey(namespace, memoryKey) : memoryKey;
}

async function handleMemoriesRoute(req: Request, url: URL, deps: HostRouteDeps): Promise<Response> {
  const access = resolveMemoriesAccess(deps);
  if (access instanceof Response) return access;

  const { persistence, syncPersistence, db, namespaceRoot, embeddingModel } = access;
  const subpath = memoriesSubpath(url);

  if (req.method === "GET" && subpath === "/namespaces") {
    try {
      const namespaces = listMemoryNamespaces(db);
      const namespaceSet = new Set(namespaces);
      const catalogProfiles = await listHostProfiles(deps.ctx.tenantKey);
      const profiles: AdminMemoriesProfileEntry[] = catalogProfiles.map((p) => {
        const ns = profileMemoryNamespace(namespaceRoot, p.profileId);
        return {
          profileId: p.profileId,
          ...(p.username !== undefined ? { username: p.username } : {}),
          namespace: ns,
          indexed: namespaceSet.has(ns),
        };
      });
      profiles.sort((a, b) => {
        const aLabel = a.username ?? a.profileId;
        const bLabel = b.username ?? b.profileId;
        return aLabel.localeCompare(bLabel);
      });
      return jsonResponse({ namespaces, profiles, namespaceRoot });
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  if (req.method === "GET" && subpath === "/graph") {
    const namespace = url.searchParams.get("namespace")?.trim();
    if (!namespace) {
      return jsonResponse({ error: "missing required query namespace" }, 400);
    }
    const scope = parseGraphScope(url.searchParams.get("scope"));
    try {
      const layout =
        scope === "subtree"
          ? buildNamespaceSubtreeGraphLayout(db, syncPersistence, namespace)
          : buildNamespaceGraphLayout(db, syncPersistence, namespace);
      return jsonResponse(layout);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  if (req.method === "GET" && subpath === "/embedding-queue") {
    try {
      return jsonResponse(readPendingEmbeddingQueueSummary(db, { limit: 50 }));
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  if (req.method === "POST" && subpath === "/embedding-queue/retry-now") {
    try {
      const removedEmpty = purgeEmptyPendingEmbeddings(db);
      const resetFailed = resetFailedPendingEmbeddings(db);
      const result = await runPendingEmbeddingRetryBatch({
        db,
        persistence,
        embeddingModel,
        ignoreBackoff: true,
        batchSize: 100,
      });
      return jsonResponse({
        ...result,
        removedEmpty: removedEmpty + result.removedEmpty,
        resetFailed,
      });
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  if (req.method === "GET" && subpath === "/edge-preview") {
    const namespace = url.searchParams.get("namespace")?.trim();
    const edgeId = url.searchParams.get("edgeId")?.trim();
    if (!namespace || !edgeId) {
      return jsonResponse({ error: "missing required query namespace and edgeId" }, 400);
    }
    try {
      const detail = loadEdgePreview(syncPersistence, namespace, edgeId);
      if (!detail) {
        return jsonResponse({ error: "edge not found in namespace" }, 404);
      }
      return jsonResponse(detail);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
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
    try {
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

      const { hits } = await searchAsync(
        { persistence },
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
      const hitKeys = hits.map((h: SearchHit) =>
        qualifySearchKey(h.memory.namespace, h.memory.key, scope),
      );
      const neighborKeys: string[] = [];
      const edgeEndpointKeys: string[] = [];
      const SEARCH_HIT_SNIPPET_MAX = 2400;

      for (const h of hits) {
        for (const n of h.neighbors ?? []) {
          neighborKeys.push(qualifySearchKey(n.namespace, n.key, scope));
        }
        if (h.graph.kind === "edge") {
          edgeEndpointKeys.push(
            qualifySearchKey(h.memory.namespace, h.graph.edge.fromKey, scope),
            qualifySearchKey(h.memory.namespace, h.graph.edge.toKey, scope),
          );
        }
      }

      const keys = [...new Set([...hitKeys, ...neighborKeys, ...edgeEndpointKeys])];

      const hitSnippets = hits.map((h: SearchHit) => {
        const sourceMapId = (h as SearchHit & { _id: string })._id;
        return {
          key: qualifySearchKey(h.memory.namespace, h.memory.key, scope),
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
            fromKey: qualifySearchKey(h.memory.namespace, h.graph.edge.fromKey, scope),
            toKey: qualifySearchKey(h.memory.namespace, h.graph.edge.toKey, scope),
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

    try {
      const resolution = resolveSearchEmbeddingPreset(persistence, body.resolution);
      const google = createGoogleGenerativeAI({ apiKey });
      const embeddingModel = createMemoriesEmbeddingModel({
        model: google.embedding("gemini-embedding-2-preview"),
        providerOptions: mergeResolutionAndProviderOptions(resolution),
      });
      const modelId = process.env.MEMORIES_INVESTIGATOR_MODEL?.trim() || "gemini-flash-latest";
      const model = google.languageModel(modelId);
      const investigatorClient = new MemoriesClient(syncPersistence, canonicalOntology);
      const investigator = new MemoryInvestigatorClient({
        registry: getInvestigatorRegistry(),
        namespace,
        model,
        client: investigatorClient,
        embeddingModel,
      });
      const { answer } = await investigator.investigate({ question, maxSteps });
      return jsonResponse(answer);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  return jsonError("Not found", 404);
}

export async function handleAdminMemoriesRoute(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  return withAdminTokenAuth(req, deps, () => handleMemoriesRoute(req, url, deps));
}
