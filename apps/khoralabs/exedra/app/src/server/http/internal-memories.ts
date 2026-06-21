import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  computeLexicalLinkMergeSlice,
  type LexicalLinkMergePatch,
  normalizeSearchConfigSnapshot,
} from "@khoralabs/memories-autolink";
import {
  MemoriesClient,
  type MergeMemoryParamsNode,
  type SearchHit,
  searchAsync,
  wrapSyncMemoriesPersistenceAsAsync,
} from "@khoralabs/memories-core";
import {
  decomposeLogicalMemoryToContent,
  type LogicalMemoryInput,
  mergeLogicalMemoryWithMergeSlice,
  type ProcessedLogicalMemory,
} from "@khoralabs/memories-core/helpers";
import type { IntegratorPlanWire } from "@khoralabs/memories-integrator";
import { integratorWireToMergeSlice } from "@khoralabs/memories-integrator";
import { loadSourceMapTextPreview } from "@khoralabs/sqlite-graph-projections";
import { embedMany } from "ai";
import type {
  ExpandedMemoryDraftWire,
  InternalMemoriesMergeRequest,
  InternalMemoriesSearchRequest,
  SearchHitSummary,
} from "../../../../shared/belief-integration.js";
import type {
  InternalMemoriesAgentSearchRequest,
  SearchHitWire,
  SearchParamsWire,
} from "../../../../shared/search-hit-wire.js";
import { logger } from "../logger.js";
import { openMemoriesAccess } from "../memories/api-handlers.js";
import {
  createExedraMemoriesEmbeddingModel,
  providerOptionsForDocumentEmbeddingPreset,
  resolveDocumentEmbeddingPreset,
  resolveGeminiApiKey,
} from "../memories/embedding.js";
import { exedraMemoriesOntology } from "../memories/exedra-ontology.js";
import { ensureScopeChain, userScope } from "../memories/namespaces.js";
import { openUserMemories } from "../memories/store.js";
import { withSpan } from "../telemetry/spans.js";
import { requireInternalToken } from "./require-internal-token.js";
import { serializeSearchHit } from "./search-hit-serialize.js";

type PersistenceWithPeerLookup = {
  findMemoryIdByKey(
    namespace: string,
    key: string,
  ): string | undefined | Promise<string | undefined>;
  loadMemoryNamespaceKey(
    memoryId: string,
  ):
    | { namespace: string; key: string }
    | undefined
    | Promise<{ namespace: string; key: string } | undefined>;
};

async function resolveFindMemoryIdByKey(
  persistence: PersistenceWithPeerLookup,
  namespace: string,
  key: string,
): Promise<string | undefined> {
  const result = persistence.findMemoryIdByKey(namespace, key);
  return result instanceof Promise ? await result : result;
}

/** Resolve integrator/autolink memory keys to persistence memory ids for mergeMemory. */
async function resolvePeerMemoryId(
  persistence: PersistenceWithPeerLookup,
  namespace: string,
  peerRef: string,
): Promise<string | undefined> {
  const loaded = persistence.loadMemoryNamespaceKey(peerRef);
  const byId = loaded instanceof Promise ? await loaded : loaded;
  if (byId !== undefined && byId.namespace === namespace) {
    return peerRef;
  }
  return resolveFindMemoryIdByKey(persistence, namespace, peerRef);
}

async function filterMergeSliceEdgesToExistingMemories(
  client: ReturnType<typeof openUserMemoriesClient>,
  namespace: string,
  slice: Pick<MergeMemoryParamsNode, "labels" | "edges" | "properties">,
): Promise<Pick<MergeMemoryParamsNode, "labels" | "edges" | "properties">> {
  if (slice.edges === undefined || slice.edges.length === 0) {
    return slice;
  }
  const kept: NonNullable<MergeMemoryParamsNode["edges"]> = [];
  for (const edge of slice.edges) {
    const memoryId = await resolvePeerMemoryId(client.persistence, namespace, edge.peer_memory_id);
    if (memoryId !== undefined) {
      kept.push({ ...edge, peer_memory_id: memoryId });
    }
  }
  if (kept.length === slice.edges.length) {
    const unchanged = kept.every(
      (edge, index) => edge.peer_memory_id === slice.edges?.[index]?.peer_memory_id,
    );
    if (unchanged) return slice;
  }
  return { ...slice, edges: kept.length > 0 ? kept : undefined };
}

const GLOBAL_ROOT = "_global_" as const;
const SEARCH_HIT_SNIPPET_MAX = 2400;
const DEFAULT_AUTOLINK_TOP_K = 10;
const DEFAULT_AUTOLINK_SEARCH_TOP_K = 25;

function resolveAutolinkTopK(): number {
  const raw = Number(process.env.EXEDRA_AUTOLINK_TOP_K);
  return Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.floor(raw)) : DEFAULT_AUTOLINK_TOP_K;
}

function resolveAutolinkMinScore(): number | undefined {
  const raw = Number(process.env.EXEDRA_AUTOLINK_MIN_SCORE);
  return Number.isFinite(raw) ? raw : undefined;
}

async function buildHybridSearchContent(text: string): Promise<{
  content: { text: string; vector?: number[] };
  arms: { lexical: number; vector: number };
}> {
  const apiKey = resolveGeminiApiKey();
  if (apiKey === undefined) {
    return { content: { text }, arms: { lexical: 1, vector: 0 } };
  }

  const preset = resolveDocumentEmbeddingPreset();
  const google = createGoogleGenerativeAI({ apiKey });
  try {
    const { embeddings } = await embedMany({
      model: google.embedding("gemini-embedding-2-preview"),
      values: [text],
      providerOptions: providerOptionsForDocumentEmbeddingPreset(preset),
    });
    const vector = embeddings[0];
    if (vector && vector.length > 0) {
      return { content: { text, vector }, arms: { lexical: 1, vector: 1 } };
    }
  } catch {
    // fall back to lexical-only
  }
  return { content: { text }, arms: { lexical: 1, vector: 0 } };
}

function memoryLabelFromDraft(
  draft: ExpandedMemoryDraftWire | undefined,
  plaintext: string,
): Record<string, unknown> {
  const memory = draft?.nodeLabelHints?.memory;
  if (memory !== undefined && typeof memory === "object" && !Array.isArray(memory)) {
    const features = (memory as { features?: unknown }).features;
    if (Array.isArray(features) && features.length > 0) {
      return { features };
    }
  }
  return {
    features: [{ aspect: "claim", statement: plaintext.slice(0, 500) }],
  };
}

function bootstrapMergeSliceFromDraft(
  draft: ExpandedMemoryDraftWire | undefined,
  plaintext: string,
): Pick<MergeMemoryParamsNode, "labels" | "edges" | "properties"> {
  const wire: IntegratorPlanWire = {
    nodeLabels: { memory: memoryLabelFromDraft(draft, plaintext) },
    edges: [],
  };
  return integratorWireToMergeSlice(exedraMemoriesOntology, wire);
}

function autolinkPatchToMergeEdges(
  patch: LexicalLinkMergePatch,
): NonNullable<MergeMemoryParamsNode["edges"]> {
  if (patch.edges === undefined || patch.edges.length === 0) return [];
  return patch.edges.map((edge) => ({
    peer_memory_id: edge.memory_key,
    direction: edge.direction,
    label: edge.label,
    ...(edge.properties !== undefined ? { properties: edge.properties } : {}),
  }));
}

async function applyAutolinkToSlice(
  client: ReturnType<typeof openUserMemoriesClient>,
  namespace: string,
  focalKey: string,
  plaintext: string,
  slice: Pick<MergeMemoryParamsNode, "labels" | "edges" | "properties">,
): Promise<Pick<MergeMemoryParamsNode, "labels" | "edges" | "properties">> {
  const { content, arms } = await buildHybridSearchContent(plaintext);
  const searchOptions = { topK: DEFAULT_AUTOLINK_SEARCH_TOP_K, neighbors: false as const, arms };

  const hits = await client.search({
    namespace,
    content,
    options: searchOptions,
  });

  const searchConfig = normalizeSearchConfigSnapshot({
    namespace,
    content,
    options: searchOptions,
  });

  const patch = computeLexicalLinkMergeSlice(focalKey, hits, {
    searchConfig,
    topK: resolveAutolinkTopK(),
    minSimilarityScore: resolveAutolinkMinScore(),
    skipEdgeMemories: true,
    tagSourceNode: false,
  });

  const autolinkEdges = autolinkPatchToMergeEdges(patch);
  if (autolinkEdges.length === 0 && (patch.labels === undefined || patch.labels.length === 0)) {
    return slice;
  }

  return {
    labels: [...(slice.labels ?? []), ...(patch.labels ?? [])],
    edges: [...(slice.edges ?? []), ...autolinkEdges],
    properties: slice.properties,
  };
}

function openUserMemoriesClient(userId: string) {
  const namespace = userScope(userId);
  const persistence = openUserMemories(userId);
  ensureScopeChain(persistence, [GLOBAL_ROOT, namespace]);
  return new MemoriesClient(persistence, exedraMemoriesOntology);
}

async function runInternalSearch(
  userId: string,
  query: string,
  topK: number,
): Promise<{ hits: SearchHitSummary[]; namespace: string }> {
  const namespace = userScope(userId);
  const access = openMemoriesAccess(openUserMemories(userId));
  const { content, arms } = await buildHybridSearchContent(query);

  const rawHits = await searchAsync(
    { persistence: wrapSyncMemoriesPersistenceAsAsync(access.persistence) },
    {
      namespace,
      content,
      options: { topK, neighbors: false, arms },
    },
  );

  const hits: SearchHitSummary[] = rawHits.map((hit: SearchHit) => {
    const sourceMapId = (hit as SearchHit & { _id: string })._id;
    return {
      key: hit.memory.key,
      namespace: hit.memory.namespace,
      snippet: loadSourceMapTextPreview(access.db, sourceMapId, SEARCH_HIT_SNIPPET_MAX) ?? "",
      score: hit.score,
    };
  });

  return { hits, namespace };
}

async function enrichSearchContentForAgent(
  content: SearchParamsWire["content"],
  arms: { lexical?: number; vector?: number } | undefined,
): Promise<SearchParamsWire["content"]> {
  const vectorWeight = arms?.vector ?? 1;
  const hasVector =
    "vector" in content && content.vector !== undefined && content.vector.length > 0;
  if (hasVector || vectorWeight <= 0) return content;

  const text = "text" in content ? content.text?.trim() : "";
  if (text === undefined || text.length === 0) return content;

  const apiKey = resolveGeminiApiKey();
  if (apiKey === undefined) return content;

  const preset = resolveDocumentEmbeddingPreset();
  const google = createGoogleGenerativeAI({ apiKey });
  try {
    const { embeddings } = await embedMany({
      model: google.embedding("gemini-embedding-2-preview"),
      values: [text],
      providerOptions: providerOptionsForDocumentEmbeddingPreset(preset),
    });
    const vector = embeddings[0];
    if (vector && vector.length > 0) {
      const lexicalWeight = arms?.lexical ?? 1;
      return lexicalWeight > 0 ? { text, vector } : { vector };
    }
  } catch {
    // fall back to lexical-only
  }
  return content;
}

async function runInternalAgentSearch(
  userId: string,
  paramsWire: SearchParamsWire,
): Promise<{ hits: SearchHitWire[] }> {
  const access = openMemoriesAccess(openUserMemories(userId));
  const content = await enrichSearchContentForAgent(paramsWire.content, paramsWire.options?.arms);
  const params = {
    ...paramsWire,
    content,
  } as Parameters<typeof searchAsync>[1];

  const rawHits = await searchAsync(
    { persistence: wrapSyncMemoriesPersistenceAsAsync(access.persistence) },
    params,
  );

  return { hits: rawHits.map((hit: SearchHit) => serializeSearchHit(hit)) };
}

export async function handleInternalMemoriesAgentSearch(req: Request): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: InternalMemoriesAgentSearchRequest;
  try {
    body = (await req.json()) as InternalMemoriesAgentSearchRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim() ?? "";
  if (userId.length === 0) return Response.json({ error: "userId is required" }, { status: 400 });
  if (body.params === undefined) {
    return Response.json({ error: "params is required" }, { status: 400 });
  }

  try {
    const result = await withSpan(
      "internal.memories.agent-search",
      { "memories.user_id": userId },
      async () => runInternalAgentSearch(userId, body.params),
    );
    return Response.json(result);
  } catch (err) {
    logger.error({ err, userId }, "internal memories agent-search failed");
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function handleInternalMemoriesProvenanceHead(req: Request): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId")?.trim() ?? "";
  if (userId.length === 0) return Response.json({ error: "userId is required" }, { status: 400 });

  try {
    const client = openUserMemoriesClient(userId);
    const fn = client.persistence.getProvenanceHeadRootHex;
    if (fn === undefined) {
      return Response.json({ rootHex: "" });
    }
    const rootHex = fn.call(client.persistence);
    const resolved = await Promise.resolve(rootHex);
    return Response.json({ rootHex: resolved ?? "" });
  } catch (err) {
    logger.error({ err, userId }, "internal memories provenance-head failed");
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function handleInternalMemoriesSearch(req: Request): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: InternalMemoriesSearchRequest;
  try {
    body = (await req.json()) as InternalMemoriesSearchRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim() ?? "";
  const query = body.query?.trim() ?? "";
  if (userId.length === 0) return Response.json({ error: "userId is required" }, { status: 400 });
  if (query.length === 0) {
    return Response.json({ hits: [], namespace: userScope(userId) });
  }

  const topK = Math.min(50, Math.max(1, Number(body.topK) || 10));

  try {
    const result = await withSpan(
      "internal.memories.search",
      { "memories.user_id": userId },
      async () => runInternalSearch(userId, query, topK),
    );
    return Response.json(result);
  } catch (err) {
    logger.error({ err, userId }, "internal memories search failed");
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function handleInternalMemoriesMerge(req: Request): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: InternalMemoriesMergeRequest;
  try {
    body = (await req.json()) as InternalMemoriesMergeRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim() ?? "";
  const logicalMemory = body.logicalMemory;
  if (userId.length === 0) return Response.json({ error: "userId is required" }, { status: 400 });
  if (logicalMemory === undefined) {
    return Response.json({ error: "logicalMemory is required" }, { status: 400 });
  }
  if (body.mode !== "bootstrap" && body.mode !== "plan") {
    return Response.json({ error: "mode must be bootstrap or plan" }, { status: 400 });
  }

  const plaintext = logicalMemory.plaintext?.trim() ?? "";
  if (plaintext.length === 0) {
    return Response.json({ error: "logicalMemory.plaintext is required" }, { status: 400 });
  }

  try {
    return await withSpan(
      "internal.memories.merge",
      { "memories.user_id": userId, "memories.mode": body.mode },
      async () => {
        const client = openUserMemoriesClient(userId);
        const embeddingModel = createExedraMemoriesEmbeddingModel();

        const input: LogicalMemoryInput = {
          key: logicalMemory.key.trim(),
          namespace: logicalMemory.namespace.trim(),
          plaintext,
        };

        const processedContent = await decomposeLogicalMemoryToContent({
          ...input,
          embedding: { embeddingModel, multimodal: false },
        });
        const processed: ProcessedLogicalMemory = { ...input, content: processedContent };

        const semanticSlice =
          body.mode === "bootstrap"
            ? bootstrapMergeSliceFromDraft(body.draft, plaintext)
            : integratorWireToMergeSlice(
                exedraMemoriesOntology,
                filterPlanEdgesToAllowedPeerKeys(
                  parseIntegratorPlanWire(body.plan),
                  body.allowedPeerKeys,
                ),
              );

        const sliceWithAutolink = await applyAutolinkToSlice(
          client,
          processed.namespace,
          processed.key,
          plaintext,
          semanticSlice,
        );

        const filteredSlice = await filterMergeSliceEdgesToExistingMemories(
          client,
          processed.namespace,
          sliceWithAutolink,
        );

        await mergeLogicalMemoryWithMergeSlice(
          client as unknown as Parameters<typeof mergeLogicalMemoryWithMergeSlice>[0],
          processed,
          filteredSlice,
          embeddingModel,
        );

        return Response.json({ memoryKey: processed.key, namespace: processed.namespace });
      },
    );
  } catch (err) {
    logger.error({ err, userId, mode: body.mode }, "internal memories merge failed");
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

function filterPlanEdgesToAllowedPeerKeys(
  plan: IntegratorPlanWire,
  allowedPeerKeys: string[] | undefined,
): IntegratorPlanWire {
  if (allowedPeerKeys === undefined) return plan;
  const allowed = new Set(allowedPeerKeys);
  const kept = plan.edges.filter((edge) => {
    if (allowed.has(edge.memory)) return true;
    logger.warn({ peerKey: edge.memory }, "merge: dropped integrator edge not in allowedPeerKeys");
    return false;
  });
  return { ...plan, edges: kept };
}

function parseIntegratorPlanWire(plan: InternalMemoriesMergeRequest["plan"]): IntegratorPlanWire {
  if (plan === undefined) {
    throw new Error("plan is required when mode is plan");
  }
  return {
    nodeLabels: plan.nodeLabels ?? {},
    edges: (plan.edges ?? []) as IntegratorPlanWire["edges"],
    properties: plan.properties,
  };
}
