import { join } from "node:path";
import { resolveMemoriesRoot } from "../../memories/persisted-memories.ts";

/**
 * Separate SQLite for matchmaking domain + lexical `Store` rows (not `memories.sqlite` graph).
 * Override with `MATCHMAKING_DOMAIN_DB`.
 */
export function resolveMatchmakingDomainDbPath(
  memoriesRoot: string = resolveMemoriesRoot(),
): string {
  const fromEnv = process.env.MATCHMAKING_DOMAIN_DB?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return join(memoriesRoot, "matchmaking-domain.sqlite");
}
