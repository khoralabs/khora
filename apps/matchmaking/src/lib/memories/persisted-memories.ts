import type { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { JsonlStore } from "@cfd/memories-stores";
import type { MatchmakingScenario } from "../scenarios/matchmaking-scenario.ts";
import type { MatchmakingMemoriesBundle } from "./create-memories-bundle.ts";

/** Root directory for matchmaking memories (SQLite + per-namespace JSONL). */
export function resolveObpDemoMemoriesRoot(): string {
  const fromEnv = process.env.OBP_DEMO_MEMORIES_ROOT?.trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), ".obp-demo-memories");
}

/** On-disk SQLite path (single DB, multiple namespaces inside). */
export function resolveObpDemoMemoriesDbPath(memoriesRoot = resolveObpDemoMemoriesRoot()): string {
  const fromEnv = process.env.OBP_DEMO_MEMORIES_DB?.trim();
  if (fromEnv) return fromEnv;
  return join(memoriesRoot, "memories.sqlite");
}

/**
 * JSONL store path for one namespace (mirrors CLI `-s` file layout; one store per namespace directory).
 * Example: `{root}/namespaces/obp_demo/matchmaking/personas/p1/store.jsonl`
 */
export function jsonlStorePathForNamespace(memoriesRoot: string, namespace: string): string {
  return join(memoriesRoot, "namespaces", ...namespace.split("/").filter(Boolean), "store.jsonl");
}

export function countMemoriesInNamespace(db: Database, namespace: string): number {
  const row = db
    .query<{ c: number }, [string]>(`SELECT COUNT(*) AS c FROM memories WHERE namespace = ?`)
    .get(namespace);
  return row?.c ?? 0;
}

function listMemoryIdsInNamespace(db: Database, namespace: string): string[] {
  return db
    .query<{ _id: string }, [string]>(`SELECT _id FROM memories WHERE namespace = ?`)
    .all(namespace)
    .map((r) => r._id);
}

/**
 * Rewrites the namespace JSONL file from SQLite (lexical text export rows), same data shape as CLI
 * {@link JsonlStore.syncFromTextExportRows}.
 */
export function rewriteNamespaceJsonlFromPersistence(
  bundle: MatchmakingMemoriesBundle,
  namespace: string,
  storePath: string,
): void {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, "", "utf8");
  const store = new JsonlStore(storePath);
  for (const memoryId of listMemoryIdsInNamespace(bundle.db, namespace)) {
    store.syncFromTextExportRows(bundle.persistence.listTextFeatureExportRowsForMemory(memoryId));
  }
}

/** True when both namespaces already hold at least the seeded persona counts (cheap reuse across runs). */
export function personaMemoriesAlreadySeeded(
  bundle: MatchmakingMemoriesBundle,
  scenario: MatchmakingScenario,
  partyAMemoryNs: string,
  partyBMemoryNs: string,
): boolean {
  const [seedsA, seedsB] = scenario.personaSeeds;
  const reqN = seedsA.length;
  const recN = seedsB.length;
  if (reqN === 0 || recN === 0) return false;
  return (
    countMemoriesInNamespace(bundle.db, partyAMemoryNs) >= reqN &&
    countMemoriesInNamespace(bundle.db, partyBMemoryNs) >= recN
  );
}

export function shouldForceMemoriesReseed(): boolean {
  return process.env.OBP_DEMO_FORCE_MEMORIES_RESEED === "1";
}

export function syncMatchmakingScenarioJsonlStores(args: {
  bundle: MatchmakingMemoriesBundle;
  memoriesRoot: string;
  partyMemoryNamespaces: readonly [string, string];
}): void {
  const { bundle, memoriesRoot, partyMemoryNamespaces } = args;
  const [nsA, nsB] = partyMemoryNamespaces;
  rewriteNamespaceJsonlFromPersistence(
    bundle,
    nsA,
    jsonlStorePathForNamespace(memoriesRoot, nsA),
  );
  rewriteNamespaceJsonlFromPersistence(
    bundle,
    nsB,
    jsonlStorePathForNamespace(memoriesRoot, nsB),
  );
}
