import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MemoriesClient } from "@cfd/memories-core";
import {
  canonicalLabelPropsSearchFormatter,
  canonicalOntology,
} from "@cfd/memories-core/ontologies";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-sqlite";

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

export function createMatchmakingMemoriesBundle(dbPath: string): MatchmakingMemoriesBundle {
  ensureParentDirForDb(dbPath);
  const db = openMemoriesDatabase(dbPath);
  const persistence = createMemoriesPersistence(db, {
    labelPropsSearchFormatter: canonicalLabelPropsSearchFormatter,
  });
  const client = new MemoriesClient(persistence, canonicalOntology);
  return { db, persistence, client };
}
