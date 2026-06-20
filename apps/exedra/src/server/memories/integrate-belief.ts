import type { Database } from "bun:sqlite";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type AgentRegistry, createAgentRegistry } from "@khoralabs/agent-capabilities";
import {
  expandedDraftToLogicalMemoryInput,
  MemoryAdapterClient,
} from "@khoralabs/memories-adapter";
import { MemoriesClient } from "@khoralabs/memories-core";
import { processLogicalMemoryWithIntegrator } from "@khoralabs/memories-integrator";
import { canonicalOntology } from "@khoralabs/memories-ontologies";

import { loadThreadMessages } from "../db/messages.js";
import { createExedraMemoriesEmbeddingModel, resolveGeminiApiKey } from "./embedding.js";
import { ensureScopeChain, userScope } from "./namespaces.js";
import { openUserMemories } from "./store.js";

const GLOBAL_ROOT = "_global_" as const;

type BeliefFlagMetadata = {
  beliefFlags?: { belief: string; messageId: string }[];
};

export type IntegrateBeliefParams = {
  db: Database;
  userId: string;
  threadId: string;
  sessionId: string;
  beliefId: string;
  feedback: "confirmed" | "corrected";
  correction?: string;
};

function parseBeliefGlobalIndex(beliefId: string): number | null {
  const sep = beliefId.lastIndexOf(":");
  if (sep < 0) return null;
  const index = Number.parseInt(beliefId.slice(sep + 1), 10);
  return Number.isFinite(index) ? index : null;
}

export function resolveBeliefText(db: Database, threadId: string, beliefId: string): string | null {
  const globalIndex = parseBeliefGlobalIndex(beliefId);
  if (globalIndex === null) return null;

  const messages = loadThreadMessages(db, threadId);
  let count = 0;
  for (const message of messages) {
    const metadata = message.metadata as BeliefFlagMetadata | undefined;
    for (const flag of metadata?.beliefFlags ?? []) {
      if (count === globalIndex) {
        return flag.belief.trim() || null;
      }
      count++;
    }
  }
  return null;
}

function resolveBeliefMemoryKey(sessionId: string, beliefId: string): string {
  return `beliefs/${sessionId}/${beliefId}`;
}

function createBeliefIntegrationModels() {
  const apiKey = resolveGeminiApiKey();
  if (apiKey === undefined) return null;

  const google = createGoogleGenerativeAI({ apiKey });
  const modelId = process.env.MEMORIES_INTEGRATOR_MODEL?.trim() || "gemini-flash-latest";
  return {
    chatModel: google.languageModel(modelId),
    embeddingModel: createExedraMemoriesEmbeddingModel(),
  };
}

export async function integrateBelief(params: IntegrateBeliefParams): Promise<void> {
  const text =
    params.feedback === "corrected"
      ? (params.correction?.trim() ?? "")
      : (resolveBeliefText(params.db, params.threadId, params.beliefId) ?? "");
  if (text.length === 0) return;

  const models = createBeliefIntegrationModels();
  if (models === null) return;

  const namespace = userScope(params.userId);
  const defaultKey = resolveBeliefMemoryKey(params.sessionId, params.beliefId);
  const persistence = openUserMemories(params.userId);
  ensureScopeChain(persistence, [GLOBAL_ROOT, namespace]);

  const registry: AgentRegistry = createAgentRegistry();
  const client = new MemoriesClient(persistence, canonicalOntology);
  const { chatModel, embeddingModel } = models;

  const adapter = new MemoryAdapterClient({
    registry,
    namespace,
    model: chatModel,
    client,
    embeddingModel,
    identityContext: { app: "exedra" },
  });

  const { draft } = await adapter.expand({
    ingest: {
      sourceApp: "exedra",
      userId: params.userId,
      correlationId: params.beliefId,
    },
    domainPayload: {
      belief: text,
      feedback: params.feedback,
      sessionId: params.sessionId,
      beliefId: params.beliefId,
    },
  });

  const logicalMemory = expandedDraftToLogicalMemoryInput(draft, namespace, defaultKey);

  await processLogicalMemoryWithIntegrator({
    client,
    logicalMemory,
    chatModel,
    embeddingModel,
    registry,
  });
}
