import { JsonlStore } from "@cfd/memories-stores";
import { processLogicalMemoryWithIntegrator } from "../integrate-memory.js";
import { elapsedMs, logger } from "../logger.js";
import { getMemoriesBundle } from "../shared.js";
import type { ParsedRemember } from "./parse-args.js";

export async function cmdRemember(args: ParsedRemember): Promise<void> {
  const bundle = getMemoriesBundle(args.db);
  const { persistence } = bundle;
  const store = new JsonlStore(args.store);
  const key = `remember-${Date.now()}`;
  const tRemember = performance.now();
  const result = await processLogicalMemoryWithIntegrator({
    bundle,
    dbPath: args.db,
    resolution: args.resolution,
    logicalMemory: {
      key,
      namespace: args.namespace,
      plaintext: args.text,
    },
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
