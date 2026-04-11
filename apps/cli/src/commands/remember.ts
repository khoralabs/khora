import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Librarian } from "@cfd/memories-librarian";
import { MemoriesClient } from "@cfd/memories-core";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-core-persistence/sqlite";
import { getMemoryIdByNamespaceKey, JsonlStore } from "@cfd/stores";
import { canonicalOntology } from "@cfd/memories-core-ontologies";
import { elapsedMs, logger } from "../logger.js";
import { ensureParentDirForDb, resolveGeminiApiKey } from "../shared.js";
import type { Parsed } from "./parse-args.js";

export async function cmdRemember(args: Parsed): Promise<void> {
  ensureParentDirForDb(args.db);
  const db = openMemoriesDatabase(args.db);
  const client = new MemoriesClient(createMemoriesPersistence(db), canonicalOntology);
  const store = new JsonlStore(args.store);
  const key = `remember-${Date.now()}`;
  const apiKey = resolveGeminiApiKey();
  const google = createGoogleGenerativeAI({ apiKey });
  const librarian = new Librarian({
    client,
    embedding: {
      model: google.embedding("gemini-embedding-2-preview"),
      resolution: args.resolution,
    },
    multimodal: false,
  });
  const model = google("gemini-flash-lite-latest");
  const tRemember = performance.now();
  const result = await librarian.processLogicalMemory({
    model,
    logicalMemory: {
      key,
      namespace: args.namespace,
      plaintext: args.text,
    },
    store,
    prefetch: true,
    runMerge: true,
    maxSteps: 6,
  });
  logger.info({
    phase: "cli.remember",
    durationMs: elapsedMs(tRemember),
    namespace: args.namespace,
    key,
    resolution: args.resolution,
  });
  const memoryId = getMemoryIdByNamespaceKey(db, args.namespace, key);
  if (memoryId) {
    store.syncFromMemoryDatabase(db, memoryId);
  }
  console.log(
    JSON.stringify({
      key,
      namespace: args.namespace,
      plan: result.plan,
      generation: {
        finishReason: result.generation.finishReason,
        usage: result.generation.usage,
      },
    }),
  );
}
