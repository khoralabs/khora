import { createAgentRegistry } from "@cfd/agent-identity";
import { expandedDraftToLogicalMemoryInput, MemoryAdapterClient } from "@cfd/memories-adapter";
import { processLogicalMemoryWithIntegrator } from "@cfd/memories-integrator";
import { JsonlStore } from "@cfd/memories-stores";
import { elapsedMs, logger } from "../logger.js";
import { getCliChatModel, getCliEmbeddingModel, getMemoriesBundle } from "../shared.js";
import { zTodoDomainPayload } from "../todo-domain-payload.js";
import type { ParsedTodoAdd } from "./parse-args.js";

export async function cmdTodoAdd(args: ParsedTodoAdd): Promise<void> {
  const ns = args.namespace;
  const { persistence } = getMemoriesBundle(args.db);
  const store = new JsonlStore(args.store);
  const bundle = getMemoriesBundle(args.db);
  const chatModel = getCliChatModel();
  const embeddingModel = getCliEmbeddingModel(args.db, args.resolution);

  const domainPayload = zTodoDomainPayload.parse({
    title: args.title,
    body: args.body,
    status: "open",
  });

  const registry = createAgentRegistry();
  const adapterClient = new MemoryAdapterClient({
    identityContext: { app: "cfd-cli", product: "todo" },
  });

  const t0 = performance.now();
  const { draft } = await adapterClient.expand({
    registry,
    namespace: ns,
    model: chatModel,
    client: bundle.client,
    embeddingModel,
    ingest: { sourceApp: "cli-todo", correlationId: `todo-${Date.now()}` },
    domainPayload,
    maxSteps: 12,
  });

  const key = `todo-${Date.now()}`;
  const logicalMemory = expandedDraftToLogicalMemoryInput(draft, ns, key);

  const result = await processLogicalMemoryWithIntegrator({
    client: bundle.client,
    logicalMemory,
    chatModel,
    embeddingModel,
    maxSteps: 6,
  });

  logger.info({
    phase: "cli.todo.add",
    durationMs: elapsedMs(t0),
    memoryNamespace: ns,
    key,
    resolution: args.resolution,
  });

  const memoryId = persistence.findMemoryIdByKey(ns, key);
  if (memoryId) {
    store.syncFromTextExportRows(persistence.listTextFeatureExportRowsForMemory(memoryId));
  }

  console.log(
    JSON.stringify({
      key,
      namespace: ns,
      adapterDraft: draft,
      plan: result.plan,
      generation: {
        finishReason: result.generation.finishReason,
        usage: result.generation.usage,
      },
    }),
  );
}
