import type { Database } from "bun:sqlite";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { InterviewMemorySearchOverride } from "@khoralabs/exedra-interview-agent";
import {
  type SearchHit,
  searchAsync,
  wrapSyncMemoriesPersistenceAsAsync,
} from "@khoralabs/memories-core";
import { loadSourceMapTextPreview } from "@khoralabs/sqlite-graph-projections";
import { embedMany } from "ai";

import { openMemoriesAccess } from "../memories/api-handlers.js";
import {
  providerOptionsForDocumentEmbeddingPreset,
  resolveDocumentEmbeddingPreset,
  resolveGeminiApiKey,
} from "../memories/embedding.js";
import { orgSessionScope, orgTeamScope, userSessionScope } from "../memories/namespaces.js";
import { canOrgAgentAccessParticipantPersonalMemories } from "../memories/personal-memory-access.js";
import { openOrgMemories, openUserMemories } from "../memories/store.js";

const SEARCH_HIT_SNIPPET_MAX = 800;
const DEFAULT_TOP_K = 6;

export type InterviewMemoryHit = {
  source: "org" | "personal";
  namespace: string;
  key: string;
  snippet: string;
  score: number;
};

export type InterviewMemoryContext = {
  orgId: string;
  teamId: string;
  sessionId: string;
  participantUserId: string;
  canSearchPersonal: boolean;
};

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

function mapHits(
  source: "org" | "personal",
  access: ReturnType<typeof openMemoriesAccess>,
  rawHits: SearchHit[],
): InterviewMemoryHit[] {
  return rawHits.map((hit) => {
    const sourceMapId = (hit as SearchHit & { _id: string })._id;
    return {
      source,
      namespace: hit.memory.namespace,
      key: hit.memory.key,
      snippet:
        loadSourceMapTextPreview(access.db, sourceMapId, SEARCH_HIT_SNIPPET_MAX) ?? hit.memory.key,
      score: hit.score,
    };
  });
}

async function searchNamespace(
  openStore: () => ReturnType<typeof openMemoriesAccess>,
  namespace: string,
  query: string,
  topK: number,
  source: "org" | "personal",
): Promise<InterviewMemoryHit[]> {
  const access = openStore();
  const { content, arms } = await buildHybridSearchContent(query);
  const rawHits = await searchAsync(
    { persistence: wrapSyncMemoriesPersistenceAsAsync(access.persistence) },
    {
      namespace,
      content,
      options: { topK, neighbors: false, arms },
    },
  );
  return mapHits(source, access, rawHits);
}

export function resolveInterviewMemoryContext(
  db: Database,
  params: {
    orgId: string;
    teamId: string;
    sessionId: string;
    participantUserId: string;
  },
): InterviewMemoryContext {
  return {
    ...params,
    canSearchPersonal: canOrgAgentAccessParticipantPersonalMemories(db, params),
  };
}

export async function searchInterviewMemories(
  context: InterviewMemoryContext,
  query: string,
  topK = DEFAULT_TOP_K,
): Promise<InterviewMemoryHit[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const perNamespaceK = Math.max(2, Math.ceil(topK / 2));
  const orgSessionNs = orgSessionScope(context.orgId, context.teamId, context.sessionId);
  const orgTeamNs = orgTeamScope(context.orgId, context.teamId);
  const openOrg = () => openMemoriesAccess(openOrgMemories(context.orgId));

  const [sessionHits, teamHits] = await Promise.all([
    searchNamespace(openOrg, orgSessionNs, trimmed, perNamespaceK, "org"),
    searchNamespace(openOrg, orgTeamNs, trimmed, perNamespaceK, "org"),
  ]);

  let personalHits: InterviewMemoryHit[] = [];
  if (context.canSearchPersonal) {
    const personalNs = userSessionScope(
      context.participantUserId,
      context.orgId,
      context.teamId,
      context.sessionId,
    );
    personalHits = await searchNamespace(
      () => openMemoriesAccess(openUserMemories(context.participantUserId)),
      personalNs,
      trimmed,
      perNamespaceK,
      "personal",
    );
  }

  const merged = [...sessionHits, ...teamHits, ...personalHits];
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, topK);
}

export async function buildInterviewMemorySearchContext(
  db: Database,
  params: {
    orgId: string;
    teamId: string;
    sessionId: string;
    participantUserId: string;
    userMessageText: string;
    sessionTopic: string;
  },
): Promise<string | null> {
  const query = [params.sessionTopic, params.userMessageText]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n");
  if (query.length === 0) return null;

  const context = resolveInterviewMemoryContext(db, params);
  const hits = await searchInterviewMemories(context, query);
  if (hits.length === 0) return null;

  const lines = hits.map(
    (hit, index) =>
      `${index + 1}. [${hit.source}] ${hit.key}: ${hit.snippet.replace(/\s+/g, " ").trim()}`,
  );

  return [
    "Relevant memory context (from organization and session personal knowledge — use as background, do not quote verbatim unless helpful):",
    ...lines,
  ].join("\n");
}

export async function searchOrgMemoriesForInterview(
  context: InterviewMemoryContext,
  query: string,
  topK = DEFAULT_TOP_K,
): Promise<InterviewMemoryHit[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const perNamespaceK = Math.max(2, Math.ceil(topK / 2));
  const orgSessionNs = orgSessionScope(context.orgId, context.teamId, context.sessionId);
  const orgTeamNs = orgTeamScope(context.orgId, context.teamId);
  const openOrg = () => openMemoriesAccess(openOrgMemories(context.orgId));

  const [sessionHits, teamHits] = await Promise.all([
    searchNamespace(openOrg, orgSessionNs, trimmed, perNamespaceK, "org"),
    searchNamespace(openOrg, orgTeamNs, trimmed, perNamespaceK, "org"),
  ]);

  const merged = [...sessionHits, ...teamHits];
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, topK);
}

export async function searchPersonalMemoriesForInterview(
  context: InterviewMemoryContext,
  query: string,
  topK = DEFAULT_TOP_K,
): Promise<InterviewMemoryHit[]> {
  if (!context.canSearchPersonal) return [];
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const personalNs = userSessionScope(
    context.participantUserId,
    context.orgId,
    context.teamId,
    context.sessionId,
  );
  return searchNamespace(
    () => openMemoriesAccess(openUserMemories(context.participantUserId)),
    personalNs,
    trimmed,
    topK,
    "personal",
  );
}

export function buildInterviewMemorySearch(
  context: InterviewMemoryContext,
): InterviewMemorySearchOverride {
  return {
    searchOrgMemories: async (query: string) => {
      const hits = await searchOrgMemoriesForInterview(context, query);
      return hits.map((hit) => ({
        source: hit.source,
        key: hit.key,
        snippet: hit.snippet,
      }));
    },
    ...(context.canSearchPersonal
      ? {
          searchPersonalMemories: async (query: string) => {
            const hits = await searchPersonalMemoriesForInterview(context, query);
            return hits.map((hit) => ({
              source: hit.source,
              key: hit.key,
              snippet: hit.snippet,
            }));
          },
        }
      : {}),
  };
}
