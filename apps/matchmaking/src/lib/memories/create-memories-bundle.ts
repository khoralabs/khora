import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Store } from "@cfd/memories-core";
import { MemoriesClient } from "@cfd/memories-core";
import {
  canonicalLabelPropsSearchFormatter,
  canonicalOntology,
} from "@cfd/memories-core/ontologies";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-sqlite";
import { JsonlStore } from "@cfd/memories-stores";
import { SqliteLexicalStore } from "../domain/lexical/sqlite-lexical-store.ts";
import { getMatchmakingDomainDatabase } from "../domain/persistence/open-domain-db.ts";

import { jsonlStorePathForNamespace } from "./jsonl-path.ts";

export type MatchmakingMemoriesBundleOptions = {
  /**
   * Root directory (used for default {@link JsonlStore} path when neither `storeForNamespace`
   * nor `domainLexicalStore` is set).
   */
  memoriesRoot: string;
  /**
   * When set, per-namespace store factory (e.g. tests). Overrides `domainLexicalStore`.
   */
  storeForNamespace?: (namespace: string) => Store;
  /**
   * When `true` and `storeForNamespace` is unset, use {@link SqliteLexicalStore} on the matchmaking
   * domain DB (replaces per-namespace `store.jsonl` under the memories root). App default.
   */
  domainLexicalStore?: boolean;
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
  const { memoriesRoot, storeForNamespace, domainLexicalStore } = options;

  let storeFn: (namespace: string) => Store;
  if (storeForNamespace) {
    storeFn = storeForNamespace;
  } else if (domainLexicalStore) {
    const domainDb = getMatchmakingDomainDatabase();
    storeFn = (ns) => new SqliteLexicalStore(domainDb, ns);
  } else {
    storeFn = (ns) => new JsonlStore(jsonlStorePathForNamespace(memoriesRoot, ns));
  }

  const client = new MemoriesClient(persistence, canonicalOntology, {
    storeForNamespace: storeFn,
  });
  return { db, persistence, client };
}
