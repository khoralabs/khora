import { JsonlStore } from "@cfd/memories-stores";
import { elapsedMs, logger } from "../logger.js";
import { getLibrarian, getMemoriesBundle } from "../shared.js";
import type { Parsed } from "./parse-args.js";

export async function cmdRemember(args: Parsed): Promise<void> {
  const { persistence } = getMemoriesBundle(args.db);
  const store = new JsonlStore(args.store);
  const key = `remember-${Date.now()}`;
  const librarian = getLibrarian(args.db, args.resolution);
  const tRemember = performance.now();
  const result = await librarian.processLogicalMemory({
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
