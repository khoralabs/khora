import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MemoriesClient } from "@cfd/memories-core";
import {
  canonicalLabelPropsSearchFormatter,
  canonicalOntology,
} from "@cfd/memories-core/ontologies";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-sqlite";
import { JsonlStore } from "@cfd/memories-stores";

import { jsonlStorePathForNamespace } from "./jsonl-path.ts";

export type MatchmakingMemoriesBundleOptions = {
  /**
   * Root directory for lexical JSONL mirrors (one `store.jsonl` per namespace under
   * `namespaces/...`). Required: matchmaking always wires {@link JsonlStore} for inspection and replay.
   */
  memoriesRoot: string;
};

export type MatchmakingMemoriesBundle = {
  db: Database;
  persistence: ReturnType<typeof createMemoriesPersistence>;
  client: MemoriesClient<
    (typeof canonicalOntology)["nodeLabels"],
    (typeof canonicalOntology)["edgeLabels"]
  >;
};

function ensureParentDirForDb(filePath: string): void {
  if (filePath === ":memory:" || filePath.startsWith("file:")) {
    return;
  }
  const dir = dirname(filePath);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
}

export function createMatchmakingMemoriesBundle(
  dbPath: string,
  options: MatchmakingMemoriesBundleOptions,
): MatchmakingMemoriesBundle {
  ensureParentDirForDb(dbPath);
  const db = openMemoriesDatabase(dbPath);
  const persistence = createMemoriesPersistence(db, {
    labelPropsSearchFormatter: canonicalLabelPropsSearchFormatter,
  });
  const { memoriesRoot } = options;
  const client = new MemoriesClient(persistence, canonicalOntology, {
    storeForNamespace: (ns) => new JsonlStore(jsonlStorePathForNamespace(memoriesRoot, ns)),
  });
  return { db, persistence, client };
}
