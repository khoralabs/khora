import { join } from "node:path";
import type { MatchmakingScenario } from "../scenarios/matchmaking-scenario.ts";
import type { MatchmakingMemoriesBundle } from "./create-memories-bundle.ts";

export { jsonlStorePathForNamespace } from "./jsonl-path.ts";

export const APP_USER_PUBLIC_SLUG = "_user_";

/** Stable memory key for persona seed slot `index` (must match seed pipeline). */
export function matchmakingSeedMemoryKey(index: number): string {
  return `seed-${index}`;
}

/** Stable memory key for persona public profile memory in shared namespace. */
export function matchmakingPublicProfileSeedMemoryKey(slug: string): string {
  return `seed/public-profile/${slug}`;
}

/** Stable memory key for app user public profile memory in live flows. */
export function matchmakingUserPublicProfileMemoryKey(): string {
  return `live/public-profile/${APP_USER_PUBLIC_SLUG}`;
}

/** Root directory for matchmaking memories (SQLite + per-namespace JSONL). */
export function resolveMemoriesRoot(): string {
  const fromEnv = process.env.MEMORIES_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), ".memories");
}

/** On-disk SQLite path (single DB, multiple namespaces inside). */
export function resolveMemoriesDbPath(memoriesRoot = resolveMemoriesRoot()): string {
  const fromEnv = process.env.MEMORIES_DB?.trim();
  if (fromEnv) return fromEnv;
  return join(memoriesRoot, "memories.sqlite");
}

/** True when every seed slot `seed-0` … `seed-(n-1)` exists in the namespace. */
export function namespaceSeedSlotsSatisfied(
  bundle: MatchmakingMemoriesBundle,
  namespace: string,
  seedCount: number,
): boolean {
  if (seedCount <= 0) {
    return true;
  }
  for (let i = 0; i < seedCount; i++) {
    if (
      bundle.persistence.findMemoryIdByKey(namespace, matchmakingSeedMemoryKey(i)) === undefined
    ) {
      return false;
    }
  }
  return true;
}

/** True when both party namespaces have all persona seed slots present. */
export function scenarioPersonaSeedSlotsSatisfied(
  bundle: MatchmakingMemoriesBundle,
  scenario: MatchmakingScenario,
): boolean {
  const [nsA, nsB] = scenario.partyMemoryNamespaces;
  const [seedsA, seedsB] = scenario.personaSeeds;
  return (
    namespaceSeedSlotsSatisfied(bundle, nsA, seedsA.length) &&
    namespaceSeedSlotsSatisfied(bundle, nsB, seedsB.length)
  );
}

export function shouldForceMemoriesReseed(): boolean {
  return process.env.OBP_DEMO_FORCE_MEMORIES_RESEED === "1";
}
