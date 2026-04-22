import { processLogicalMemoryWithIntegrator } from "@cfd/memories-integrator";
import { JsonlStore } from "@cfd/memories-stores";
import { elapsedMs, logger } from "../logger.js";
import { getCliChatModel, getCliEmbeddingModel, getMemoriesBundle } from "../shared.js";
import type { ParsedRemember } from "./parse-args.js";

export async function cmdRemember(args: ParsedRemember): Promise<void> {
  const bundle = getMemoriesBundle(args.db);
  const { persistence } = bundle;
  const store = new JsonlStore(args.store);
  const key = `remember-${Date.now()}`;
  const tRemember = performance.now();
  const chatModel = getCliChatModel();
  const embeddingModel = getCliEmbeddingModel(args.db, args.resolution);
  const result = await processLogicalMemoryWithIntegrator({
    client: bundle.client,
    logicalMemory: {
      key,
      namespace: args.namespace,
      plaintext: args.text,
    },
    chatModel,
    embeddingModel,
    maxSteps: 6,
  });
  logger.info({
    phase: "cli.remember",
    durationMs: elapsedMs(tRemember),
    namespace: args.namespace,
    key,
    resolution: args.resolution,
  });
  const memoryId = persistence.findMemoryIdByKey(args.namespace, key);
  if (memoryId) {
    store.syncFromTextExportRows(persistence.listTextFeatureExportRowsForMemory(memoryId));
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
